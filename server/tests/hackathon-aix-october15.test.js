const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const { migrateHackathonAiXOctober15 } = require("../src/config/migrations/hackathonAiXOctober15");
const { migrateHackathonSubmissions } = require("../src/config/migrations/hackathonSubmissions");
const { createHackathonSubmissionService } = require("../src/services/hackathonSubmissionService");

test("October 15 campus selection migrates once and enforces upload, submission and deadline without changing Huawei or existing entries", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-oct15-"));
    const filename = path.join(dir, "isolated.sqlite");
    const db = await open({ filename, driver: sqlite3.Database });
    const eventKey = defaults.event.key;
    let clock = Date.parse("2026-10-17T23:59:59+08:00");
    const service = createHackathonSubmissionService({ filename, now: () => clock });
    try {
        await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,form_data_json TEXT,created_at TEXT);`);
        const current = structuredClone(defaults);
        current.event.program.challenges = [{ id: "published", published: true, title: "Keep" }];
        current.event.program.trackStages.campus = structuredClone(
            current.event.program.trackStages.industry
        );
        const other = { event: { key: "history" }, custom: "Keep" };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({ revision: 1, events: [current, other] }),
        ]);
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?,1,?,?)", [
            eventKey,
            JSON.stringify({ track: ["campus", "industry"] }),
            "2026-10-13",
        ]);
        await migrateHackathonSubmissions(db);
        // Exercise upgrading the earlier file table and preserve its existing ID.
        const fileSchema = (
            await db.get("SELECT sql FROM sqlite_master WHERE name='hackathon_submission_files'")
        ).sql;
        await db.exec("DROP TABLE hackathon_submission_files");
        await db.exec(
            fileSchema.replace(
                "CHECK(stage IN ('initial','semifinal'))",
                "CHECK(stage = 'semifinal')"
            )
        );
        await db.run(
            "INSERT INTO hackathon_submission_files VALUES(88,?,1,1,'campus','semifinal','bp','legacy-bp','legacy.pdf',12,'application/pdf','2026-10-13')",
            [eventKey]
        );
        const registrations = await db.all("SELECT * FROM hackathon_registrations");
        const industry = structuredClone(current.event.program.trackStages.industry);
        await migrateHackathonAiXOctober15(db);
        const saved = (
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")
        ).value;
        await migrateHackathonAiXOctober15(db);
        assert.equal(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"))
                .value,
            saved
        );
        const config = JSON.parse(saved);
        assert.deepEqual(config.events[1], other);
        assert.equal(
            (await db.get("SELECT storage_name FROM hackathon_submission_files WHERE id=88"))
                .storage_name,
            "legacy-bp"
        );
        assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
        assert.deepEqual(config.events[0].event.program.trackStages.industry, industry);
        assert.deepEqual(
            config.events[0].event.program.challenges,
            current.event.program.challenges
        );
        assert.deepEqual(await db.all("SELECT * FROM hackathon_registrations"), registrations);
        assert.equal(
            (await service.getMine(1, eventKey)).tracks.campus.stages.initial.state,
            "upcoming"
        );
        const upload = (kind) =>
            service.addFile(
                1,
                { eventKey, track: "campus", stage: "initial", kind },
                {
                    storageName: `${kind}-test`,
                    name: kind === "bp" ? "plan.pdf" : "demo.mp4",
                    size: 12,
                    mimeType: kind === "bp" ? "application/pdf" : "video/mp4",
                }
            );
        await assert.rejects(
            () => upload("bp"),
            (e) => e.reason === "not_open"
        );
        clock = Date.parse("2026-10-18T00:00:00+08:00");
        const mine = await service.getMine(1, eventKey);
        assert.deepEqual(mine.tracks.campus.stages.initial.requiredFields, [
            "projectName",
            "githubUrl",
            "modelscopeUrl",
            "bpFileId",
            "demoFileId",
        ]);
        const bp = await upload("bp"),
            demo = await upload("demo");
        const materials = {
            projectName: "Campus entry",
            githubUrl: "https://github.com/example/project",
            modelscopeUrl: "https://example-project.ms.show",
            bpFileId: bp.file.id,
            demoFileId: demo.file.id,
        };
        await assert.rejects(
            () =>
                service.save(1, {
                    eventKey,
                    track: "campus",
                    stage: "initial",
                    action: "submit",
                    expectedVersion: 0,
                    materials: { ...materials, bpFileId: null },
                }),
            (e) => e.field === "bpFileId"
        );
        const receipt = await service.save(1, {
            eventKey,
            track: "campus",
            stage: "initial",
            action: "submit",
            expectedVersion: 0,
            materials,
        });
        assert.ok(receipt.submission.submittedAt);
        clock = Date.parse("2026-10-20T22:59:59+08:00");
        assert.equal(
            (await service.getMine(1, eventKey)).tracks.campus.stages.initial.canSubmit,
            true
        );
        clock = Date.parse("2026-10-20T23:00:00+08:00");
        const closed = await service.getMine(1, eventKey);
        assert.equal(closed.tracks.campus.stages.initial.canSubmit, false);
        assert.equal(closed.tracks.industry.stages.semifinal.state, "open");
        assert.equal(closed.tracks.campus.stages.semifinal.canSubmit, false);
        await assert.rejects(
            () => upload("demo"),
            (e) => e.reason === "closed"
        );
        assert.equal(closed.submissions.length, 1);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
