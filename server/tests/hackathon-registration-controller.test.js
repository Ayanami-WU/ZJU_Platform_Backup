const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("hackathon controller stores and returns configurable form answers", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-hackathon-template-"));
    process.env.DATABASE_FILE = path.join(tempDir, "database.sqlite");
    process.env.NODE_ENV = "test";

    const originalWarn = console.warn;
    console.warn = () => {};
    const { getDb, pool } = require("../src/config/db");
    const {
        saveHackathonTemplate,
        saveHackathonSchedule,
        DEFAULT_HACKATHON_TEMPLATE,
    } = require("../src/services/hackathonTemplateService");
    const hackathonController = require("../src/controllers/hackathonController");

    const createResponse = () => ({
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    });

    try {
        const db = await getDb();
        await db.exec(`
            CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY);
            INSERT INTO users VALUES(1);
            CREATE TABLE competitions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                subtitle TEXT,
                description TEXT,
                event_date TEXT,
                cover_image TEXT,
                is_featured INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                deleted_at TEXT
            );
            CREATE TABLE hackathon_registrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_key TEXT NOT NULL DEFAULT 'zhekesong-current',
                user_id INTEGER REFERENCES users(id),
                name TEXT NOT NULL,
                student_id TEXT NOT NULL,
                major TEXT NOT NULL,
                grade TEXT NOT NULL,
                ai_tools TEXT NOT NULL,
                experience TEXT DEFAULT '',
                form_data_json TEXT DEFAULT '{}',
                template_revision INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(event_key, student_id)
            );
        `);

        await require("../src/config/migrations/registrationProfiles").migrateRegistrationProfiles(
            db
        );
        await require("../src/services/registrationProfileService").saveRegistrationProfile(db, 1, {
            name: "测试同学",
            studentId: "3230100000",
            major: "计算机科学",
            grade: "junior",
        });

        const template = JSON.parse(JSON.stringify(DEFAULT_HACKATHON_TEMPLATE));
        // This case tests successful configurable registration, so keep its fixture upcoming.
        template.event.startAt = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
        template.event.endAt = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 16);
        template.form.fields.push({
            id: "diet",
            label: "饮食需求",
            type: "select",
            placeholder: "请选择",
            required: true,
            enabled: true,
            width: "half",
            options: [
                { value: "none", label: "无" },
                { value: "vegetarian", label: "素食" },
            ],
        });
        const saved = await saveHackathonTemplate(db, template);

        const registerResponse = createResponse();
        await hackathonController.registerHackathon(
            {
                user: { id: 1 },
                body: {
                    eventKey: saved.event.key,
                    templateRevision: saved.revision,
                    answers: {
                        name: "测试同学",
                        studentId: "3230100000",
                        major: "计算机科学",
                        grade: "junior",
                        aiTools: ["codex"],
                        experience: "做过一个校园助手",
                        diet: "vegetarian",
                    },
                },
            },
            registerResponse,
            (error) => {
                if (error) throw error;
            }
        );
        assert.equal(registerResponse.statusCode, 201);

        const stored = await db.get("SELECT * FROM hackathon_registrations WHERE id = ?", [
            registerResponse.body.id,
        ]);
        assert.equal(JSON.parse(stored.form_data_json).diet, "vegetarian");
        assert.equal(stored.template_revision, saved.revision);
        assert.equal(stored.event_key, saved.event.key);

        const secondTemplate = JSON.parse(JSON.stringify(saved));
        secondTemplate.event.key = "zhekesong-second";
        secondTemplate.event.title = "第二场浙客松";
        secondTemplate.event.startAt = new Date(Date.now() + 14 * 86400000)
            .toISOString()
            .slice(0, 16);
        secondTemplate.event.endAt = new Date(Date.now() + 15 * 86400000)
            .toISOString()
            .slice(0, 16);
        secondTemplate.results.competitionSlug = "zhekesong-second";
        await saveHackathonSchedule(db, {
            activeEventKey: saved.event.key,
            events: [saved, secondTemplate],
        });

        const secondRegisterResponse = createResponse();
        await hackathonController.registerHackathon(
            {
                user: { id: 1 },
                body: {
                    eventKey: secondTemplate.event.key,
                    answers: {
                        name: "测试同学",
                        studentId: "3230100000",
                        major: "计算机科学",
                        grade: "junior",
                        aiTools: ["codex"],
                        experience: "继续参加第二场",
                        diet: "none",
                    },
                },
            },
            secondRegisterResponse,
            (error) => {
                if (error) throw error;
            }
        );
        assert.equal(secondRegisterResponse.statusCode, 201);
        assert.equal(secondRegisterResponse.body.eventKey, secondTemplate.event.key);

        const listResponse = createResponse();
        await hackathonController.getRegistrations({}, listResponse, (error) => {
            if (error) throw error;
        });
        assert.equal(listResponse.body.length, 2);
        // Both rows can share a created_at timestamp; verify answers by registration identity.
        const byId = new Map(listResponse.body.map((row) => [row.id, row]));
        assert.equal(byId.get(registerResponse.body.id).form_data.diet, "vegetarian");
        assert.equal(byId.get(secondRegisterResponse.body.id).form_data.diet, "none");
    } finally {
        console.warn = originalWarn;
        await pool.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test("AI-X track submissions preserve separate answers, concurrent entries and legacy joint registrations", async () => {
    const { open } = require("sqlite");
    const sqlite3 = require("sqlite3");
    const {
        saveTrackRegistration,
        registrationPayload,
        withdrawTrackRegistration,
    } = require("../src/services/hackathonTrackRegistrationService");
    const template = require("../../shared/hackathonAiX.json");
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            `CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,name TEXT,student_id TEXT,major TEXT,grade TEXT,ai_tools TEXT,experience TEXT,form_data_json TEXT,template_revision INTEGER,created_at TEXT,UNIQUE(event_key,user_id),UNIQUE(event_key,student_id));`
        );
        const base = {
            name: "Track test",
            studentId: "student-one",
            major: "Design",
            grade: "junior",
            aiTools: ["Codex"],
            experience: "First project",
            contact: "13800138000",
        };
        const industry = { ...base, track: ["industry"], team: "Huawei team", teamSize: "3", isCaptain: "yes" };
        const campus = {
            ...base,
            track: ["campus"],
            team: "Campus team",
            isCaptain: "no",
            teamSize: "4",
            experience: "Second project",
            contact: "13900139000",
        };
        await Promise.all([
            saveTrackRegistration(db, { userId: 1, template, answers: industry }),
            saveTrackRegistration(db, { userId: 1, template, answers: campus }),
        ]);
        let row = await db.get("SELECT * FROM hackathon_registrations WHERE user_id=1");
        const payload = registrationPayload(row);
        assert.deepEqual(payload.answers.track, ["industry", "campus"]);
        assert.deepEqual(payload.trackRegistrations.industry.answers, industry);
        assert.deepEqual(payload.trackRegistrations.campus.answers, campus);
        assert.equal(payload.trackRegistrations.campus.answers.isCaptain, "no");
        assert.equal(payload.trackRegistrations.industry.answers.isCaptain, "yes");
        assert.equal((await db.get("SELECT COUNT(*) n FROM hackathon_registrations")).n, 1);
        await Promise.all([
            saveTrackRegistration(db, {
                userId: 1,
                template,
                answers: { ...campus, experience: "Updated campus" },
            }),
            saveTrackRegistration(db, {
                userId: 1,
                template,
                answers: { ...industry, experience: "Updated industry" },
            }),
        ]);
        row = await db.get("SELECT * FROM hackathon_registrations WHERE user_id=1");
        const updated = registrationPayload(row);
        assert.equal(updated.id, payload.id);
        assert.equal(updated.createdAt, payload.createdAt);
        assert.equal(
            updated.trackRegistrations.campus.createdAt,
            payload.trackRegistrations.campus.createdAt
        );
        assert.equal(updated.trackRegistrations.campus.answers.experience, "Updated campus");
        assert.equal(updated.trackRegistrations.industry.answers.experience, "Updated industry");
        const before = row.form_data_json;
        await assert.rejects(saveTrackRegistration(db, { userId: 2, template, answers: campus }), {
            code: "HACKATHON_ALREADY_REGISTERED",
        });
        assert.equal(
            (await db.get("SELECT form_data_json FROM hackathon_registrations WHERE user_id=1"))
                .form_data_json,
            before
        );
        const legacy = {
            ...base,
            track: ["industry", "campus"],
            contact: "legacy@example.test",
            teamSize: "3",
        };
        await db.run(
            "INSERT INTO hackathon_registrations(event_key,user_id,student_id,form_data_json,created_at) VALUES(?,?,?,?,?)",
            [template.event.key, 3, "legacy-one", JSON.stringify(legacy), "2026-10-12"]
        );
        row = await db.get("SELECT * FROM hackathon_registrations WHERE user_id=3");
        const old = registrationPayload(row);
        assert.equal(old.trackRegistrations.industry.legacy, true);
        assert.equal(old.trackRegistrations.campus.answers.isCaptain, undefined);
        assert.equal(old.trackRegistrations.campus.answers.contact, "legacy@example.test");
        assert.equal(
            (await db.get("SELECT form_data_json FROM hackathon_registrations WHERE user_id=3"))
                .form_data_json,
            JSON.stringify(legacy)
        );
        const editedLegacy = await saveTrackRegistration(db, {
            userId: 3,
            template,
            answers: { ...campus, studentId: "legacy-one", isCaptain: "yes" },
        });
        const editedLegacyPayload = registrationPayload(editedLegacy);
        assert.deepEqual(
            editedLegacyPayload.trackRegistrations.industry,
            old.trackRegistrations.industry
        );
        assert.equal(editedLegacyPayload.trackRegistrations.campus.answers.isCaptain, "yes");
        assert.equal(editedLegacyPayload.createdAt, old.createdAt);
        assert.equal(editedLegacyPayload.id, old.id);
        const single = { ...legacy, track: ["campus"] };
        await db.run("UPDATE hackathon_registrations SET form_data_json=? WHERE user_id=3", [
            JSON.stringify(single),
        ]);
        const upgraded = await saveTrackRegistration(db, {
            userId: 3,
            template,
            answers: { ...industry, studentId: "legacy-one" },
        });
        assert.deepEqual(registrationPayload(upgraded).trackRegistrations.campus.answers, single);
        assert.equal(
            registrationPayload(upgraded).trackRegistrations.industry.answers.teamSize,
            "3"
        );
        const joint = await saveTrackRegistration(db, {
            userId: 4,
            template,
            answers: { ...campus, studentId: "joint-four", track: ["industry", "campus"] },
        });
        const jointTracks = registrationPayload(joint).trackRegistrations;
        assert.equal(jointTracks.campus.answers.isCaptain, "no");
        assert.equal(jointTracks.campus.answers.team, "Campus team");
        assert.equal(jointTracks.campus.answers.teamSize, "4");
        assert.equal(jointTracks.industry.answers.isCaptain, "no");
        assert.equal(jointTracks.industry.answers.team, "Campus team");
        assert.equal(jointTracks.industry.answers.teamSize, "4");
        const withdrawn = registrationPayload(await withdrawTrackRegistration(db, { userId: 4, track: "industry" }));
        assert.deepEqual(withdrawn.activeTracks, ["campus"]);
        assert.equal(withdrawn.trackRegistrations.industry.active, false);
        assert.ok(withdrawn.trackRegistrations.industry.cancelledAt);
        assert.deepEqual(withdrawn.trackRegistrations.industry.answers, jointTracks.industry.answers);
        assert.deepEqual(withdrawn.trackRegistrations.campus, jointTracks.campus);
        assert.deepEqual(registrationPayload(await withdrawTrackRegistration(db, { userId: 4, track: "industry" })), withdrawn);
        await assert.rejects(withdrawTrackRegistration(db, { userId: 5, track: "industry" }), { status: 404 });
        const restored = registrationPayload(await saveTrackRegistration(db, {
            userId: 4, template, answers: { ...industry, studentId: "joint-four" },
        }));
        assert.equal(restored.id, withdrawn.id);
        assert.equal(restored.createdAt, withdrawn.createdAt);
        assert.deepEqual(restored.activeTracks, ["industry", "campus"]);
        assert.equal(restored.trackRegistrations.industry.cancelledAt, null);
        assert.deepEqual(restored.trackRegistrations.campus, jointTracks.campus);
    } finally {
        await db.close();
    }
});
