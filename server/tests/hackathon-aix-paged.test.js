const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const { migrateHackathonAiXPaged: migrate } = require("../src/config/migrations/hackathonAiXPaged");
const { validateRegistrationAnswers } = require("../src/services/hackathonTemplateService");

test("five-page migration updates only the event rules and preserves registrations, custom fields and published challenges", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            'CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,form_data_json TEXT);INSERT INTO hackathon_registrations VALUES(1,\'{"teamSize":"2"}\');'
        );
        const event = structuredClone(defaults);
        event.event.program.registrationOpensAt = "2026-10-12T00:00:00+08:00";
        event.event.program.stages[1].closesAt = "2026-10-23T00:00:00+08:00";
        event.event.program.challenges = [{ id: "published", published: true }];
        event.form.fields.find((f) => f.id === "contact").label = "Custom";
        const history = { event: { key: "old" }, form: { fields: [] } };
        await db.run(
            "INSERT INTO settings VALUES('hackathon_schedule_config',?)",
            JSON.stringify({ revision: 3, activeEventKey: "old", events: [history, event] })
        );
        await migrate(db);
        const saved = await db.get(
            "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
        );
        const result = JSON.parse(saved.value);
        assert.equal(result.revision, 4);
        assert.equal(result.activeEventKey, "old");
        assert.deepEqual(result.events[0], history);
        const current = result.events[1];
        assert.equal(current.event.program.registrationOpensAt, "2026-10-13T00:00:00+08:00");
        assert.equal(current.event.program.stages[1].closesAt, "2026-10-24T00:00:00+08:00");
        assert.deepEqual(current.event.program.challenges, event.event.program.challenges);
        assert.equal(current.form.fields.find((f) => f.id === "contact").label, "Custom");
        assert.deepEqual(
            current.form.fields.find((f) => f.id === "teamSize").options.map((o) => o.value),
            ["1", "2", "3", "4", "5"]
        );
        assert.equal(
            (await db.get("SELECT * FROM hackathon_registrations")).form_data_json,
            '{"teamSize":"2"}'
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
test("five-page migration does not create or publish missing events", async () => {
    for (const schedule of [null, { events: [{ event: { key: "old" } }] }]) {
        const db = await open({ filename: ":memory:", driver: sqlite3.Database });
        try {
            await db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)");
            if (schedule)
                await db.run(
                    "INSERT INTO settings VALUES('hackathon_schedule_config',?)",
                    JSON.stringify(schedule)
                );
            await migrate(db);
            await migrate(db);
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            assert.deepEqual(row ? JSON.parse(row.value) : null, schedule);
        } finally {
            await db.close();
        }
    }
});
test("Tmall accepts 1-5 team members while Huawei-only entry requires one person", () => {
    const answers = {
        name: "Test",
        studentId: "T",
        major: "Design",
        grade: "junior",
        contact: "13800138000",
        strengths: ["design"],
        aiTools: ["Codex"],
        experience: "Project",
        researchExperience: "Research",
    };
    for (const track of [["campus"], ["industry"], ["campus", "industry"]]) {
        for (const teamSize of track.length === 1 && track[0] === "industry" ? ["1"] : ["1", "5"])
            assert.deepEqual(
                validateRegistrationAnswers(defaults, { ...answers, track, teamSize }).errors,
                []
            );
        for (const teamSize of track.length === 1 && track[0] === "industry"
            ? ["", "0", "2", "5", "6"]
            : ["", "0", "6"])
            assert.ok(
                validateRegistrationAnswers(defaults, { ...answers, track, teamSize }).errors.some(
                    (e) => e.field === "teamSize"
                )
            );
    }
});

test("individual entry update preserves an already migrated event's edited dates and fields", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            "CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);INSERT INTO settings VALUES('hackathon_ai_x_five_pages_20261013_v1','1')"
        );
        const event = structuredClone(defaults);
        event.event.format = "old format";
        event.event.program.registrationOpensAt = "2026-10-14T00:00:00+08:00";
        event.form.fields.find((f) => f.id === "teamSize").label = "Custom team label";
        await db.run(
            "INSERT INTO settings VALUES('hackathon_schedule_config',?)",
            JSON.stringify({ events: [event] })
        );
        await migrate(db);
        const saved = JSON.parse(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")).value
        ).events[0];
        assert.equal(saved.event.format, defaults.event.format);
        assert.deepEqual(saved.event.program, event.event.program);
        assert.deepEqual(saved.form.fields, event.form.fields);
    } finally {
        await db.close();
    }
});
