const defaults = require("../../../../shared/hackathonAiX.json");
const MARKER = "hackathon_ai_x_team_identity_v1";

async function migrateHackathonAiXTeamIdentity(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const event = schedule?.events?.find((item) => item.event?.key === defaults.event.key);
            if (Array.isArray(event?.form?.fields)) {
                const before = JSON.stringify(event.form.fields);
                for (const id of ["team", "isCaptain"]) {
                    const definition = defaults.form.fields.find((field) => field.id === id);
                    const existing = event.form.fields.find((field) => field.id === id);
                    if (existing) {
                        Object.assign(existing, {
                            required: true,
                            enabled: true,
                            type: definition.type,
                            ...(id === "isCaptain" ? { options: definition.options } : {}),
                        });
                    } else {
                        if (event.form.fields.length >= 24)
                            throw new Error(
                                "AI+X registration has no room for team identity fields"
                            );
                        const anchor = event.form.fields.findIndex((field) => field.id === "team");
                        event.form.fields.splice(
                            anchor < 0 ? event.form.fields.length : anchor + 1,
                            0,
                            structuredClone(definition)
                        );
                    }
                }
                if (before !== JSON.stringify(event.form.fields)) {
                    event.revision = Number(event.revision || 1) + 1;
                    schedule.revision = Number(schedule.revision || 1) + 1;
                    event.updatedAt = schedule.updatedAt = new Date().toISOString();
                    await db.run(
                        "UPDATE settings SET value=? WHERE key='hackathon_schedule_config'",
                        [JSON.stringify(schedule)]
                    );
                }
            }
            // Historical answers remain untouched; never infer a captain from names or team size.
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}

module.exports = { migrateHackathonAiXTeamIdentity };
