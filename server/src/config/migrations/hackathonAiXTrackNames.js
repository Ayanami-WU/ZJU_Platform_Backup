const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_track_names_original_open_enterprise_v3";

async function migrateHackathonAiXTrackNames(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const current = schedule?.events?.find(
                (item) => item.event?.key === defaults.event.key
            );
            if (current) {
                for (const key of ["description", "format", "duration"])
                    current.event[key] = defaults.event[key];
                if (current.form) {
                    current.form.description = defaults.form.description;
                    const names = defaults.form.fields.find(
                        (field) => field.id === "track"
                    ).options;
                    const field = current.form.fields?.find((item) => item.id === "track");
                    for (const option of field?.options || []) {
                        const name = names.find((item) => item.value === option.value);
                        if (name) option.label = name.label;
                    }
                }
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

module.exports = { migrateHackathonAiXTrackNames };
