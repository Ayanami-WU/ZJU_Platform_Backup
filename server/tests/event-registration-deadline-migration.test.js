const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");

const {
    migrateEventRegistrationDeadline,
} = require("../src/config/migrations/eventRegistrationDeadline");

test("event registration deadline migration adds the field without changing existing records", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const db = {
        all: async (sql) => sqlite.prepare(sql).all(),
        exec: async (sql) => sqlite.exec(sql),
    };
    try {
        sqlite.exec("CREATE TABLE events (id INTEGER PRIMARY KEY, title TEXT)");
        sqlite.prepare("INSERT INTO events (id, title) VALUES (1, 'Existing event')").run();

        await migrateEventRegistrationDeadline(db);
        await migrateEventRegistrationDeadline(db);

        const columns = sqlite.prepare("PRAGMA table_info(events)").all();
        assert.equal(columns.filter((column) => column.name === "registration_deadline").length, 1);
        const existing = sqlite
            .prepare("SELECT id, title, registration_deadline FROM events")
            .get();
        assert.equal(existing.id, 1);
        assert.equal(existing.title, "Existing event");
        assert.equal(existing.registration_deadline, null);
    } finally {
        sqlite.close();
    }
});
