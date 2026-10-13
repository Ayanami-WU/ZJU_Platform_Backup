const test = require("node:test"),
    assert = require("node:assert/strict"),
    sqlite = require("sqlite"),
    sqlite3 = require("sqlite3");
const {
    migrateHackathonAiXOctober12: migrate,
} = require("../src/config/migrations/hackathonAiXOctober12");
test("October12 revision preserves old signups, published briefs, editor settings and other editions across startup", async () => {
    const db = await sqlite.open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            "CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,form_data_json TEXT);"
        );
        const template = structuredClone(require("../../shared/hackathonAiX.json"));
        template.rules.push({ id: "editor-extra", description: "Keep this rule" });
        template.event.program.challenges = [{ id: "published", published: true }];
        template.form.fields.find((f) => f.id === "contact").label = "Custom contact";
        const old = { event: { key: "history", startAt: "2026-05-10" }, form: { fields: [] } };
        const schedule = { events: [old, template], activeEventKey: "history" };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify(schedule),
        ]);
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?)", [
            JSON.stringify({
                track: ["campus"],
                team: "Original",
                github: "https://github.com/test/repo",
            }),
        ]);
        const before = await db.all("SELECT * FROM hackathon_registrations");
        await migrate(db);
        const after = JSON.parse(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")).value
        );
        assert.deepEqual(after.events[0], old);
        assert.equal(
            after.events[1].rules.find((r) => r.id === "editor-extra").description,
            "Keep this rule"
        );
        assert.equal(after.activeEventKey, "history");
        assert.deepEqual(after.events[1].event.program.challenges, [
            { id: "published", published: true },
        ]);
        assert.equal(after.events[1].event.program.stages[0].opensAt, "2026-10-18T13:00:00+08:00");
        assert.equal(after.events[1].event.program.stages[1].closesAt, "2026-10-24T00:00:00+08:00");
        assert.equal(
            after.events[1].form.fields.find((f) => f.id === "track").options[0].label,
            "天猫学科创意赛道"
        );
        assert.equal(
            after.events[1].form.fields.find((f) => f.id === "contact").label,
            "Custom contact"
        );
        assert.deepEqual(await db.all("SELECT * FROM hackathon_registrations"), before);
        await migrate(db);
        assert.deepEqual(
            JSON.parse(
                (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"))
                    .value
            ),
            after
        );
    } finally {
        await db.close();
    }
});
