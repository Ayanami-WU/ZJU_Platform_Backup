const test = require("node:test");
const assert = require("node:assert/strict");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const {
    migrateHackathonAiXTeamIdentity: migrate,
} = require("../src/config/migrations/hackathonAiXTeamIdentity");
const {
    validateRegistrationAnswers,
    getHackathonTemplate,
} = require("../src/services/hackathonTemplateService");

const valid = {
    name: "Example",
    studentId: "TEST",
    major: "Design",
    grade: "junior",
    track: ["campus"],
    team: "Example team",
    teamSize: "2",
    isCaptain: "no",
    contact: "13800138000",
    strengths: ["exploring"],
    aiTools: ["none"],
    experience: "课程项目开发",
    researchExperience: "文献研究",
};

test("both tracks require team names and explicit yes/no captain answers", () => {
    for (const track of [["campus"], ["industry"]]) {
        for (const isCaptain of ["yes", "no"]) {
            const result = validateRegistrationAnswers(defaults, { ...valid, track, isCaptain });
            assert.deepEqual(result.errors, []);
            assert.equal(result.answers.isCaptain, isCaptain);
        }
        for (const [field, values] of [
            ["team", [undefined, "", "   "]],
            ["isCaptain", [undefined, "", false, true, "false", "true", "captain"]],
        ]) {
            for (const value of values)
                assert.ok(
                    validateRegistrationAnswers(defaults, { ...valid, track, [field]: value }).errors.some(
                        (error) => error.field === field
                    ),
                    `${field}: ${value}`
                );
        }
    }
});

test("team identity migration publishes fields through the template API without rewriting history", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,form_data_json TEXT);`);
        const oldAnswers = JSON.stringify({ team: "Historical", teamSize: "1", track: ["campus"] });
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?)", [oldAnswers]);
        const event = structuredClone(defaults);
        event.form.fields = event.form.fields.filter((field) => field.id !== "isCaptain");
        Object.assign(
            event.form.fields.find((field) => field.id === "team"),
            {
                required: false,
                enabled: false,
                label: "Custom team name",
            }
        );
        const other = { event: { key: "old" }, form: { fields: [] } };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({
                revision: 4,
                activeEventKey: defaults.event.key,
                events: [other, event],
            }),
        ]);
        await migrate(db);
        const saved = await db.get(
            "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
        );
        const schedule = JSON.parse(saved.value);
        assert.equal(schedule.revision, 5);
        assert.deepEqual(schedule.events[0], other);
        const fields = (await getHackathonTemplate(db, defaults.event.key)).form.fields;
        assert.equal(fields.find((field) => field.id === "team").required, true);
        assert.equal(fields.find((field) => field.id === "team").enabled, true);
        assert.equal(fields.find((field) => field.id === "team").label, "Custom team name");
        const captain = fields.find((field) => field.id === "isCaptain");
        assert.equal(captain.required, true);
        assert.equal(captain.type, "select");
        assert.deepEqual(
            captain.options.map((option) => option.value),
            ["yes", "no"]
        );
        assert.equal(
            (await db.get("SELECT form_data_json FROM hackathon_registrations")).form_data_json,
            oldAnswers
        );
        await migrate(db);
        assert.deepEqual(
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"),
            saved
        );
        assert.ok(
            validateRegistrationAnswers(defaults, { ...valid, isCaptain: undefined }).errors.some(
                (error) => error.field === "isCaptain"
            )
        );
    } finally {
        await db.close();
    }
});

test("team identity migration leaves missing editions unpublished", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)");
        await migrate(db);
        await migrate(db);
        assert.equal(
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"),
            undefined
        );
    } finally {
        await db.close();
    }
});
