const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const {
    migrateHackathonAiXInitialExtension,
} = require("../src/config/migrations/hackathonAiXInitialExtension");
const { migrateHackathonSubmissions } = require("../src/config/migrations/hackathonSubmissions");
const { createHackathonSubmissionService } = require("../src/services/hackathonSubmissionService");

test("Huawei initial extension reopens real writes until 18:15 and preserves other windows, records and later admin edits", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-initial-extension-"));
    const filename = path.join(dir, "isolated.sqlite");
    const db = await open({ filename, driver: sqlite3.Database });
    const eventKey = defaults.event.key;
    let clock = Date.parse("2026-10-18T17:31:00+08:00");
    const service = createHackathonSubmissionService({ filename, now: () => clock });
    const read = async () =>
        JSON.parse(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")).value
        );
    try {
        await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,form_data_json TEXT,created_at TEXT);
            INSERT INTO settings VALUES('hackathon_ai_x_track_stage_submissions_v1','1');`);
        const event = structuredClone(defaults);
        event.event.program.trackStages.industry[0].closesAt = "2026-10-18T17:30:00+08:00";
        const other = { event: { key: "history" }, custom: "preserve" };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({ revision: 34, events: [event, other] }),
        ]);
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?,1,?,?)", [
            eventKey,
            JSON.stringify({ track: ["industry"] }),
            "2026-10-13",
        ]);
        await migrateHackathonSubmissions(db);
        assert.equal(
            (await service.getMine(1, eventKey)).tracks.industry.stages.initial.state,
            "closed"
        );
        const registrations = await db.all("SELECT * FROM hackathon_registrations");
        await migrateHackathonAiXInitialExtension(db);
        const migrated = await read();
        const actual = migrated.events[0];
        assert.equal(
            actual.event.program.trackStages.industry[0].closesAt,
            "2026-10-18T18:15:00+08:00"
        );
        const expected = structuredClone(event);
        expected.event.program.trackStages.industry[0].closesAt = "2026-10-18T18:15:00+08:00";
        expected.event.program.stages[0].closesAt = "2026-10-18T18:15:00+08:00";
        expected.revision = actual.revision;
        expected.updatedAt = actual.updatedAt;
        assert.deepEqual(actual, expected);
        assert.deepEqual(migrated.events[1], other);
        assert.deepEqual(await db.all("SELECT * FROM hackathon_registrations"), registrations);
        const save = (action, expectedVersion, materials) =>
            service.save(1, {
                eventKey,
                track: "industry",
                stage: "initial",
                action,
                expectedVersion,
                materials,
            });
        assert.equal(
            (await service.getMine(1, eventKey)).tracks.industry.stages.initial.canSubmit,
            true
        );
        const file = (
            await service.addFile(
                1,
                { eventKey, track: "industry", stage: "initial", kind: "bp" },
                {
                    storageName: "extension-test",
                    name: "说明书.pdf",
                    size: 12,
                    mimeType: "application/pdf",
                }
            )
        ).file;
        const materials = {
            projectName: "Extension test",
            githubUrl: "https://github.com/example/project",
            modelscopeUrl: "https://example.ms.show",
            bpFileId: file.id,
        };
        const saved = await save("save", 0, materials);
        clock = Date.parse("2026-10-18T18:14:59+08:00");
        const submitted = await save("submit", saved.submission.version, materials);
        assert.ok(submitted.submission.submittedAt);
        clock = Date.parse("2026-10-18T18:15:00+08:00");
        assert.equal(
            (await service.getMine(1, eventKey)).tracks.industry.stages.initial.canSubmit,
            false
        );
        await assert.rejects(
            () => save("submit", submitted.submission.version, materials),
            (e) => e.reason === "closed"
        );
        await migrateHackathonAiXInitialExtension(db);
        assert.deepEqual(await read(), migrated);
        assert.equal((await service.getMine(1, eventKey)).submissions.length, 1);
        migrated.events[0].event.program.trackStages.industry[0].closesAt =
            "2026-10-18T19:00:00+08:00";
        await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
            JSON.stringify(migrated),
        ]);
        await migrateHackathonAiXInitialExtension(db);
        assert.deepEqual(await read(), migrated);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
