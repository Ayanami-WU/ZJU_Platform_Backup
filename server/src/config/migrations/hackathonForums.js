async function migrateHackathonForums(db) {
    await db.exec(`CREATE TABLE IF NOT EXISTS hackathon_forum_registrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_key TEXT NOT NULL,
        forum_key TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact TEXT NOT NULL,
        organization TEXT NOT NULL DEFAULT '',
        attendee_type TEXT NOT NULL DEFAULT '',
        student_id TEXT NOT NULL DEFAULT '',
        major TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL DEFAULT '',
        question TEXT NOT NULL DEFAULT '',
        school TEXT NOT NULL DEFAULT '',
        project_experience TEXT NOT NULL DEFAULT '',
        research_experience TEXT NOT NULL DEFAULT '',
        ai_capabilities TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(event_key, user_id, forum_key)
    );
    CREATE INDEX IF NOT EXISTS idx_hackathon_forum_roster ON hackathon_forum_registrations(event_key, forum_key);`);
    const columns = new Set(
        (await db.all("PRAGMA table_info(hackathon_forum_registrations)")).map(
            (column) => column.name
        )
    );
    for (const column of [
        "attendee_type",
        "student_id",
        "major",
        "grade",
        "question",
        "school",
        "project_experience",
        "research_experience",
        "ai_capabilities",
    ]) {
        if (!columns.has(column)) {
            await db.exec(
                `ALTER TABLE hackathon_forum_registrations ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`
            );
        }
    }
}
module.exports = { migrateHackathonForums };
