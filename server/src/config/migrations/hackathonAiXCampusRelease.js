const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_campus_release_oct14_v1";
async function migrateHackathonAiXCampusRelease(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const row = await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'");
            const schedule = row ? JSON.parse(row.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === defaults.event.key);
            if (event?.event?.program) {
                event.event.program.campusChallengeReleaseAt = defaults.event.program.campusChallengeReleaseAt;
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [JSON.stringify(schedule)]);
            }
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
module.exports = { migrateHackathonAiXCampusRelease };
