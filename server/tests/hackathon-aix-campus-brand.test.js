const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const {
    migrateHackathonAiXCampusBrand: migrate,
} = require("../src/config/migrations/hackathonAiXCampusBrand");

test("campus brand display update preserves IDs, dates, history and registration snapshots", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            "CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,form_data_json TEXT);"
        );
        const snapshot = '{"track":["campus"],"team":"天猫队"}';
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?)", [snapshot]);
        const history = { event: { key: "previous", description: "天猫历史活动" } };
        const current = {
            event: {
                key: "zhekesong-ai-x-2026",
                description: "天猫OPC赛道；天猫校园支持",
                program: {
                    stages: [{ id: "final", opensAt: "2026-10-25T09:15:00+08:00" }],
                    challenges: [
                        { id: "天猫-technical-id", title: "天猫赛题", briefUrl: "/天猫.pdf" },
                    ],
                },
            },
            form: {
                fields: [{ id: "track", options: [{ value: "campus", label: "天猫OPC孵化赛道" }] }],
            },
        };
        const program = structuredClone(current.event.program);
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({ revision: 3, activeEventKey: "previous", events: [history, current] }),
        ]);
        await migrate(db);
        const saved = await db.get(
            "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
        );
        const after = JSON.parse(saved.value);
        assert.deepEqual(after.events[0], history);
        assert.equal(after.activeEventKey, "previous");
        assert.equal(after.events[1].event.description, "天猫校园OPC赛道；天猫校园支持");
        assert.deepEqual(after.events[1].event.program.stages, program.stages);
        assert.deepEqual(after.events[1].event.program.challenges, [
            { id: "天猫-technical-id", title: "天猫校园赛题", briefUrl: "/天猫.pdf" },
        ]);
        assert.deepEqual(after.events[1].form.fields[0].options, [
            { value: "campus", label: "天猫校园OPC孵化赛道" },
        ]);
        assert.equal(
            (await db.get("SELECT form_data_json FROM hackathon_registrations")).form_data_json,
            snapshot
        );
        await migrate(db);
        assert.deepEqual(
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"),
            saved
        );
    } finally {
        await db.close();
    }
});
