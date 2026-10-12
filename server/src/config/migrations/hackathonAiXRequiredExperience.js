const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_required_experience_v1";

async function migrateHackathonAiXRequiredExperience(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === defaults.event.key);
            if (Array.isArray(event?.form?.fields)) {
                let changed = false;
                for (const id of ["experience", "researchExperience"]) {
                    const field = event.form.fields.find((item) => item.id === id);
                    if (!field) continue;
                    if (field.required !== true) {
                        field.required = true;
                        changed = true;
                    }
                    if (field.placeholder?.includes("暂无经历可留空")) {
                        field.placeholder = defaults.form.fields.find(
                            (item) => item.id === id
                        ).placeholder;
                        changed = true;
                    }
                }
                if (changed) {
                    event.revision = Number(event.revision || 1) + 1;
                    event.updatedAt = new Date().toISOString();
                    schedule.revision = Number(schedule.revision || 1) + 1;
                    schedule.updatedAt = event.updatedAt;
                    await db.run(
                        "UPDATE settings SET value=? WHERE key='hackathon_schedule_config'",
                        [JSON.stringify(schedule)]
                    );
                }
            }
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = { migrateHackathonAiXRequiredExperience };
