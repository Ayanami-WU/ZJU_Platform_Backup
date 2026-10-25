const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const {
    migrateHackathonFlexibleRecords,
} = require("../src/config/migrations/hackathonFlexibleRecords");
const { migrateHackathonSubmissions } = require("../src/config/migrations/hackathonSubmissions");
const { importHackathonRecords } = require("../src/services/hackathonRecordImportService");
const { createHackathonSubmissionService } = require("../src/services/hackathonSubmissionService");
const defaults = require("../../shared/hackathonAiX.json");
const eventKey = defaults.event.key;

test("migration preserves children and existing snapshots; incomplete and different records join one roster, with atomic and idempotent imports", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hackathon-import-"));
    const filename = path.join(dir, "db.sqlite");
    const db = await open({ filename, driver: sqlite3.Database });
    try {
        await db.exec(`PRAGMA foreign_keys=ON;
            CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT,name TEXT NOT NULL,student_id TEXT NOT NULL,major TEXT NOT NULL,grade TEXT NOT NULL,ai_tools TEXT NOT NULL,form_data_json TEXT,created_at TEXT,user_id INTEGER REFERENCES users(id), UNIQUE(event_key,student_id));
            CREATE UNIQUE INDEX idx_hackathon_registration_user ON hackathon_registrations(event_key,user_id) WHERE user_id IS NOT NULL;
            CREATE TABLE hackathon_submissions(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,registration_id INTEGER NOT NULL REFERENCES hackathon_registrations(id) ON DELETE CASCADE,track TEXT NOT NULL,stage TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,draft_json TEXT NOT NULL DEFAULT '{}',draft_updated_at TEXT NOT NULL,submitted_json TEXT,submitted_at TEXT,UNIQUE(event_key,user_id,track,stage));
            CREATE TABLE child(id INTEGER PRIMARY KEY,registration_id INTEGER REFERENCES hackathon_registrations(id) ON DELETE CASCADE);
        `);
        await db.run("INSERT INTO settings VALUES(?,?)", [
            "hackathon_schedule_config",
            JSON.stringify({ activeEventKey: eventKey, events: [defaults] }),
        ]);
        await db.run(
            "INSERT INTO settings VALUES('hackathon_ai_x_track_stage_submissions_v1','1')"
        );
        const form = { track: ["campus"], name: "测试甲", contact: "13800000001", team: "旧队名" };
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?,?,?,?,?,?,?,?,1)", [
            eventKey,
            "测试甲",
            "S1",
            "计算机",
            "junior",
            "[]",
            JSON.stringify(form),
            "2026-10-01",
        ]);
        await db.run("INSERT INTO child VALUES(1,1)");
        await db.run(
            "INSERT INTO hackathon_submissions(event_key,user_id,registration_id,track,stage,draft_json,draft_updated_at,submitted_json,submitted_at) VALUES(?,1,1,'campus','initial',?,?,?,?)",
            [
                eventKey,
                '{"projectName":"新草稿"}',
                "2026-10-20",
                '{"projectName":"原正式作品"}',
                "2026-10-19",
            ]
        );
        const original = await db.get("SELECT * FROM hackathon_submissions");
        await migrateHackathonFlexibleRecords(db);
        await migrateHackathonSubmissions(db);
        await migrateHackathonFlexibleRecords(db);
        assert.equal((await db.get("PRAGMA foreign_keys")).foreign_keys, 1);
        assert.equal((await db.get("SELECT COUNT(*) n FROM child")).n, 1);
        assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
        assert.equal(
            (await db.get("SELECT submitted_json FROM hackathon_submissions WHERE id=1"))
                .submitted_json,
            original.submitted_json
        );
        const make = (row, name, contact) => ({
            row,
            name,
            contact,
            teamName: "新队名",
            teamSize: 3,
            submittedDate: "2026-10-20",
            materials: {
                projectName: "",
                productHighlights: "简介",
                attachmentReferences: [{ kind: "bp", name: "尚未提供.pdf" }],
            },
        });
        const manifest = {
            eventKey,
            track: "campus",
            stage: "initial",
            sourceHash: "a".repeat(64),
            sheet: "报名",
            rows: [
                make(2, "测试甲", "13800000001"),
                make(3, "测试甲", "13800000002"),
                make(4, "测试乙", "13800000003"),
            ],
        };
        await db.exec("BEGIN IMMEDIATE");
        const preview = await importHackathonRecords(db, manifest);
        assert.equal(preview.linked, 1);
        assert.equal(preview.registrationsCreated, 2);
        await db.exec("ROLLBACK");
        assert.equal((await db.get("SELECT COUNT(*) n FROM hackathon_registrations")).n, 1);
        await db.exec("BEGIN IMMEDIATE");
        const applied = await importHackathonRecords(db, manifest);
        assert.equal(applied.fingerprint, preview.fingerprint);
        await db.exec("COMMIT");
        assert.equal(
            (
                await db.get(
                    "SELECT COUNT(*) n FROM hackathon_registrations WHERE student_id IS NULL AND user_id IS NULL"
                )
            ).n,
            2
        );
        assert.equal(
            (await db.get("SELECT form_data_json FROM hackathon_registrations WHERE id=1"))
                .form_data_json,
            JSON.stringify(form)
        );
        await db.exec("BEGIN IMMEDIATE");
        const retry = await importHackathonRecords(db, manifest);
        await db.exec("COMMIT");
        assert.equal(retry.skipped, 3);
        assert.equal(retry.inserted, 0);
        const service = createHackathonSubmissionService({ filename });
        const roster = await service.getRoster(eventKey);
        assert.equal(roster.rows.length, 4);
        assert.equal(roster.rows.filter((row) => row.userId === null).length, 2);
        assert.equal(new Set(roster.rows.map((row) => row.rowKey)).size, 4);
        assert.equal(
            roster.rows.find((row) => row.submissions.initial.id === 1).submissions.initial
                .submitted.projectName,
            "原正式作品"
        );
        assert.equal((await service.getMine(1, eventKey)).submissions.length, 1);
        assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
        // A source key cannot silently replace a different record.
        const changed = structuredClone(manifest);
        changed.rows[0].name = "被改动";
        await db.exec("BEGIN IMMEDIATE");
        await assert.rejects(() => importHackathonRecords(db, changed), /changed/);
        await db.exec("ROLLBACK");
        assert.equal((await db.get("SELECT COUNT(*) n FROM hackathon_submissions")).n, 4);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
