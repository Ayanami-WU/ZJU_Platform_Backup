const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_individual_entry_20261013_v2";
async function migrateHackathonAiXPaged(db) {
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
                // Existing installations only need the corrected participation wording.
                const alreadyPaged = await db.get("SELECT value FROM settings WHERE key=?", [
                    "hackathon_ai_x_five_pages_20261013_v1",
                ]);
                if (!alreadyPaged) {
                    for (const key of ["duration", "subtitle"])
                        event.event[key] = defaults.event[key];
                    const program = (event.event.program ||= {});
                    program.registrationOpensAt = defaults.event.program.registrationOpensAt;
                    const semifinal = program.stages?.find((stage) => stage.id === "semifinal");
                    if (semifinal)
                        semifinal.closesAt = defaults.event.program.stages.find(
                            (stage) => stage.id === "semifinal"
                        ).closesAt;
                    const size = event.form?.fields?.find((field) => field.id === "teamSize");
                    if (size) {
                        const value = defaults.form.fields.find((field) => field.id === "teamSize");
                        for (const key of ["label", "placeholder", "required", "options"])
                            size[key] = value[key];
                    }
                }
                if (event.form) event.form.description = defaults.form.description;
                const rule = event.rules?.find((rule) => rule.id === "cross_discipline");
                if (rule) rule.description = defaults.rules[0].description;
                event.revision = Number(event.revision || 1) + 1;
                event.updatedAt = new Date().toISOString();
                schedule.revision = Number(schedule.revision || 1) + 1;
                schedule.updatedAt = event.updatedAt;
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
module.exports = { migrateHackathonAiXPaged };
