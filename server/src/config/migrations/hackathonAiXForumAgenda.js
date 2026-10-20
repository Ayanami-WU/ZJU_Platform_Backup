const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_forum_agenda_oct21_v2";

// Reconcile the published schedule without touching registrations, works,
// challenges, other editions, or dates that operators changed separately.
async function migrateHackathonAiXForumAgenda(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key = ?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key = 'hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const current = schedule?.events?.find(
                (item) => item.event?.key === defaults.event.key
            );
            if (current) {
                const before = JSON.stringify(current);
                if (
                    ["2026-10-25T17:00", "2026-10-25T16:30", "2026-10-25T16:00"].includes(
                        current.event.endAt
                    )
                ) {
                    current.event.endAt = defaults.event.endAt;
                }
                const program = current.event.program;
                const groups = [program?.stages, ...Object.values(program?.trackStages || {})];
                for (const stages of groups) {
                    for (const stage of stages || []) {
                        if (stage.id === "final" && stage.opensAt === "2026-10-25T09:10:00+08:00") {
                            stage.opensAt = "2026-10-25T09:15:00+08:00";
                        }
                    }
                }
                if (JSON.stringify(current) !== before) {
                    const updatedAt = new Date().toISOString();
                    current.revision = Number(current.revision || 1) + 1;
                    schedule.revision = Number(schedule.revision || 1) + 1;
                    current.updatedAt = schedule.updatedAt = updatedAt;
                    await db.run(
                        "UPDATE settings SET value = ? WHERE key = 'hackathon_schedule_config'",
                        [JSON.stringify(schedule)]
                    );
                }
            }
            await db.run("INSERT INTO settings(key, value) VALUES(?, '1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = { migrateHackathonAiXForumAgenda };
