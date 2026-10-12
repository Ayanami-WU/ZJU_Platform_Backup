const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_track_stage_submissions_v1";
async function migrateHackathonSubmissions(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        await db.exec(`
            CREATE TABLE IF NOT EXISTS hackathon_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_key TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                registration_id INTEGER NOT NULL REFERENCES hackathon_registrations(id) ON DELETE CASCADE,
                track TEXT NOT NULL CHECK(track IN ('campus','industry')),
                stage TEXT NOT NULL CHECK(stage IN ('initial','semifinal')),
                version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
                draft_json TEXT NOT NULL DEFAULT '{}',
                draft_updated_at TEXT NOT NULL,
                submitted_json TEXT,
                submitted_at TEXT,
                CHECK ((submitted_json IS NULL AND submitted_at IS NULL) OR (submitted_json IS NOT NULL AND submitted_at IS NOT NULL)),
                UNIQUE(event_key,user_id,track,stage)
            );
            CREATE INDEX IF NOT EXISTS idx_hackathon_submissions_roster ON hackathon_submissions(event_key,track,stage);
            CREATE TABLE IF NOT EXISTS hackathon_submission_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_key TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                registration_id INTEGER NOT NULL REFERENCES hackathon_registrations(id) ON DELETE CASCADE,
                track TEXT NOT NULL CHECK(track IN ('campus','industry')),
                stage TEXT NOT NULL CHECK(stage = 'semifinal'),
                kind TEXT NOT NULL CHECK(kind IN ('bp','demo')),
                storage_name TEXT NOT NULL UNIQUE,
                original_name TEXT NOT NULL,
                size INTEGER NOT NULL,
                mime_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_hackathon_submission_files_owner ON hackathon_submission_files(event_key,user_id);
            CREATE TABLE IF NOT EXISTS hackathon_submission_qualifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_key TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                registration_id INTEGER NOT NULL REFERENCES hackathon_registrations(id) ON DELETE CASCADE,
                track TEXT NOT NULL CHECK(track IN ('campus','industry')),
                qualified INTEGER NOT NULL DEFAULT 0 CHECK(qualified IN (0,1)),
                updated_at TEXT NOT NULL,
                updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
                UNIQUE(event_key,user_id,track)
            );
        `);
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            if (stored) {
                const schedule = JSON.parse(stored.value);
                const event = schedule.events?.find(
                    (item) => item.event?.key === defaults.event.key
                );
                if (event) {
                    event.event.program ||= {};
                    event.event.program.trackStages = structuredClone(
                        defaults.event.program.trackStages
                    );
                    event.revision = Number(event.revision || 1) + 1;
                    schedule.revision = Number(schedule.revision || 1) + 1;
                    event.updatedAt = schedule.updatedAt = new Date().toISOString();
                    await db.run(
                        "UPDATE settings SET value=? WHERE key='hackathon_schedule_config'",
                        [JSON.stringify(schedule)]
                    );
                }
            }
            // Existing repository URLs remain historical links; never invent a formal submission.
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
module.exports = { migrateHackathonSubmissions };
