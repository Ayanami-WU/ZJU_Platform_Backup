// Private administrative analysis; never creates public project cards or user accounts.
async function migrateHackathonProjectInventory(db) {
    await db.exec(`
        CREATE TABLE IF NOT EXISTS hackathon_registration_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL,
            source_key TEXT NOT NULL,
            track TEXT NOT NULL CHECK(track IN ('industry','campus')),
            team_name TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            discipline TEXT NOT NULL,
            industry TEXT NOT NULL,
            evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('brief','material','unknown')),
            evidence_json TEXT NOT NULL,
            snapshot_at TEXT NOT NULL,
            UNIQUE(event_key,source_key)
        );
        CREATE TABLE IF NOT EXISTS hackathon_personal_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_key TEXT NOT NULL,
            source_key TEXT NOT NULL,
            title TEXT NOT NULL,
            discipline TEXT NOT NULL,
            industry TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            snapshot_at TEXT NOT NULL,
            UNIQUE(event_key,source_key)
        );
        CREATE TABLE IF NOT EXISTS hackathon_personal_project_members (
            project_id INTEGER NOT NULL REFERENCES hackathon_personal_projects(id) ON DELETE CASCADE,
            registration_id INTEGER NOT NULL REFERENCES hackathon_registrations(id) ON DELETE CASCADE,
            evidence_json TEXT NOT NULL,
            PRIMARY KEY(project_id,registration_id)
        );
        CREATE INDEX IF NOT EXISTS idx_personal_projects_registration
            ON hackathon_personal_project_members(registration_id);
    `);
}
module.exports = { migrateHackathonProjectInventory };
