const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_both_team_tracks_v1";

async function migrateHackathonAiXTeamTracks(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === defaults.event.key);
            if (event) {
                event.event.format = defaults.event.format;
                if (event.form) event.form.description = defaults.form.description;
                const rule = event.rules?.find((item) => item.id === "cross_discipline");
                if (rule)
                    rule.description = defaults.rules.find(
                        (item) => item.id === "cross_discipline"
                    ).description;
                const size = event.form?.fields?.find((field) => field.id === "teamSize");
                if (size) {
                    const definition = defaults.form.fields.find((field) => field.id === "teamSize");
                    Object.assign(size, {
                        required: true,
                        enabled: true,
                        type: "select",
                        options: definition.options,
                    });
                }
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
            }
            // Do not invent team identity or reinterpret historical individual registrations.
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = { migrateHackathonAiXTeamTracks };
