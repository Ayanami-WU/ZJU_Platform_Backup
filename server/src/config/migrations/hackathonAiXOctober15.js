const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_oct15_campus_selection_v1";
async function migrateHackathonAiXOctober15(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const files = await db.get(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='hackathon_submission_files'"
            );
            if (files && /CHECK\s*\(\s*stage\s*=\s*'semifinal'\s*\)/i.test(files.sql)) {
                const create = files.sql
                    .replace(
                        /CREATE TABLE\s+hackathon_submission_files/i,
                        "CREATE TABLE hackathon_submission_files_oct15"
                    )
                    .replace(
                        /CHECK\s*\(\s*stage\s*=\s*'semifinal'\s*\)/i,
                        "CHECK(stage IN ('initial','semifinal'))"
                    );
                await db.exec(create);
                await db.exec(`INSERT INTO hackathon_submission_files_oct15 SELECT * FROM hackathon_submission_files;
                    DROP TABLE hackathon_submission_files;
                    ALTER TABLE hackathon_submission_files_oct15 RENAME TO hackathon_submission_files;
                    CREATE INDEX idx_hackathon_submission_files_owner ON hackathon_submission_files(event_key,user_id);`);
            }
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const current = schedule?.events?.find(
                (item) => item.event?.key === defaults.event.key
            );
            if (current) {
                const program = (current.event.program ||= {});
                program.trackStages ||= {};
                program.trackStages.campus = structuredClone(
                    defaults.event.program.trackStages.campus
                );
                program.campusReview = structuredClone(defaults.event.program.campusReview);
                current.event.duration = defaults.event.duration;
                if (current.form) current.form.description = defaults.form.description;
                for (const rule of current.rules || []) {
                    const updated = defaults.rules.find((item) => item.id === rule.id);
                    if (updated) rule.description = updated.description;
                }
                current.revision = Number(current.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                current.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
            }
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
module.exports = { migrateHackathonAiXOctober15 };
