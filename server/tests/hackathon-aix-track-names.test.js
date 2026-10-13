const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const {
    migrateHackathonAiXTrackNames: migrate,
} = require("../src/config/migrations/hackathonAiXTrackNames");

test("track rename keeps IDs, registration snapshots, schedules and published briefs intact", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            'CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,form_data_json TEXT);INSERT INTO hackathon_registrations VALUES(1,\'{"track":["campus"],"team":"Original"}\');'
        );
        const current = structuredClone(defaults);
        const track = current.form.fields.find((field) => field.id === "track");
        track.options[0].label = "天猫·OPC孵化赛道";
        track.options[1].label = "华为·产业进阶赛道";
        current.event.program.challenges = [{ title: "华为正式赛题", published: true }];
        current.rules.push({ id: "custom", description: "Custom rule" });
        const history = { event: { key: "history", description: "Historical event" } };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({ activeEventKey: "history", events: [history, current] }),
        ]);
        const registrations = await db.all("SELECT * FROM hackathon_registrations");
        await migrate(db);
        const saved = await db.get(
            "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
        );
        const after = JSON.parse(saved.value);
        assert.deepEqual(after.events[0], history);
        assert.equal(after.activeEventKey, "history");
        assert.deepEqual(after.events[1].event.program, current.event.program);
        assert.deepEqual(after.events[1].rules.at(-1), current.rules.at(-1));
        assert.deepEqual(
            after.events[1].form.fields.find((field) => field.id === "track").options,
            [
                { value: "campus", label: "学科创意赛道" },
                { value: "industry", label: "产业命题赛道" },
            ]
        );
        assert.deepEqual(await db.all("SELECT * FROM hackathon_registrations"), registrations);
        await migrate(db);
        assert.deepEqual(
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"),
            saved
        );
    } finally {
        await db.close();
    }
});
