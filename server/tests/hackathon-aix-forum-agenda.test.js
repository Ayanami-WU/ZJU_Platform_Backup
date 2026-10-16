const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const {
    migrateHackathonAiXForumAgenda: migrate,
} = require("../src/config/migrations/hackathonAiXForumAgenda");

async function database(schedule) {
    const db = await sqlite.open({ filename: ":memory:", driver: sqlite3.Database });
    await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
        CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY, event_key TEXT, form_data_json TEXT);
        INSERT INTO hackathon_registrations VALUES(42, 'zhekesong-ai-x-2026', '{"track":["campus","industry"]}');`);
    if (schedule) {
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config', ?)", [
            JSON.stringify(schedule),
        ]);
    }
    return db;
}

async function read(db) {
    const row = await db.get("SELECT value FROM settings WHERE key = 'hackathon_schedule_config'");
    return row ? JSON.parse(row.value) : null;
}

test("forum agenda migration updates old dates once while retaining user submissions and custom content", async () => {
    const event = structuredClone(defaults);
    event.event.endAt = "2026-10-25T17:00";
    event.event.program.challenges = [{ id: "published", title: "Keep this", published: true }];
    const groups = [event.event.program.stages, ...Object.values(event.event.program.trackStages)];
    for (const stages of groups) {
        stages.find((stage) => stage.id === "final").opensAt = "2026-10-25T09:10:00+08:00";
    }
    const history = { event: { key: "previous", endAt: "2026-05-10T18:00" } };
    const db = await database({
        revision: 9,
        activeEventKey: history.event.key,
        events: [history, event],
    });
    try {
        const registrations = await db.all("SELECT * FROM hackathon_registrations");
        await migrate(db);
        const saved = await read(db);
        assert.equal(saved.events[1].event.endAt, "2026-10-25T16:00");
        for (const stages of [
            saved.events[1].event.program.stages,
            ...Object.values(saved.events[1].event.program.trackStages),
        ]) {
            assert.equal(
                stages.find((stage) => stage.id === "final").opensAt,
                "2026-10-25T09:15:00+08:00"
            );
        }
        assert.deepEqual(saved.events[0], history);
        assert.deepEqual(saved.events[1].event.program.challenges, event.event.program.challenges);
        assert.deepEqual(saved.events[1].form, event.form);
        assert.equal(
            saved.events[1].event.program.registrationClosesAt,
            event.event.program.registrationClosesAt
        );
        assert.equal(saved.activeEventKey, history.event.key);
        assert.equal(saved.revision, 10);
        assert.deepEqual(await db.all("SELECT * FROM hackathon_registrations"), registrations);
        await migrate(db);
        assert.deepEqual(await read(db), saved);
    } finally {
        await db.close();
    }
});

test("forum agenda migration preserves operator changes and does not create an absent event", async () => {
    for (const schedule of [
        null,
        { revision: 4, events: [{ event: { key: "previous" } }] },
        {
            revision: 4,
            events: [
                {
                    event: {
                        key: defaults.event.key,
                        endAt: "2026-10-26T18:00",
                        program: {
                            stages: [{ id: "final", opensAt: "2026-10-26T10:00:00+08:00" }],
                        },
                    },
                },
            ],
        },
    ]) {
        const db = await database(schedule);
        try {
            await migrate(db);
            assert.deepEqual(await read(db), schedule);
        } finally {
            await db.close();
        }
    }
});
