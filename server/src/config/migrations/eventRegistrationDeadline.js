async function migrateEventRegistrationDeadline(db) {
    const columns = await db.all("PRAGMA table_info(events)");
    if (columns.some((column) => column.name === "registration_deadline")) return;
    await db.exec("ALTER TABLE events ADD COLUMN registration_deadline TEXT");
}

module.exports = { migrateEventRegistrationDeadline };
