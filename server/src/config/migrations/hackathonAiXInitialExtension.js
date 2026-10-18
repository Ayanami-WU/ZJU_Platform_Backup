const EVENT_KEY = "zhekesong-ai-x-2026";
const MARKER = "hackathon_ai_x_huawei_initial_1815_20261018_v1";
const DEADLINE = "2026-10-18T18:15:00+08:00";

async function migrateHackathonAiXInitialExtension(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === EVENT_KEY);
            if (event) {
                const program = event.event.program;
                const industry = program?.trackStages?.industry?.find(
                    (stage) => stage.id === "initial"
                );
                if (!industry) throw new Error("Huawei initial submission window is missing");
                industry.closesAt = DEADLINE;
                const general = program.stages?.find((stage) => stage.id === "initial");
                if (general) general.closesAt = DEADLINE;
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
                await db.run("INSERT INTO settings(key,value) VALUES(?,?)", [MARKER, DEADLINE]);
            }
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = { migrateHackathonAiXInitialExtension };
