const EVENT_KEY = "zhekesong-ai-x-2026";
const MARKER = "hackathon_ai_x_challenge_handbook_v4_20261018_v1";

async function migrateHackathonAiXChallengeHandbook(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === EVENT_KEY);
            const defaults = require("../../../../shared/hackathonAiX.json");
            const handbook = defaults.event.program.challenges.find(
                (item) => item.id === "huawei-initial-challenge-handbook-v4"
            );
            if (event && handbook) {
                const program = (event.event.program ||= {});
                const defaultIndustryStages = defaults.event.program.trackStages.industry;
                program.trackStages ||= {};
                program.trackStages.industry = (program.trackStages.industry || []).map((stage) => ({
                    ...stage,
                    ...(defaultIndustryStages.find((item) => item.id === stage.id)?.requiredFields
                        ? { requiredFields: defaultIndustryStages.find((item) => item.id === stage.id).requiredFields }
                        : {}),
                }));
                const challenges = Array.isArray(program.challenges) ? program.challenges : [];
                const index = challenges.findIndex((item) => item.id === handbook.id);
                if (index >= 0) challenges[index] = handbook;
                else challenges.push(handbook);
                program.challenges = challenges;
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
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

module.exports = { migrateHackathonAiXChallengeHandbook };
