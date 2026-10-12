const MARKER = "hackathon_ai_x_october12_20261012_v1";
async function migrateHackathonAiXOctober12(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const row = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const template = schedule?.events?.find((t) => t.event?.key === "zhekesong-ai-x-2026");
            if (template) {
                const defaults = require("../../../../shared/hackathonAiX.json");
                for (const key of [
                    "brand",
                    "description",
                    "subtitle",
                    "startAt",
                    "location",
                    "format",
                    "duration",
                    "prizeValue",
                    "prizeUnit",
                ])
                    template.event[key] = defaults.event[key];
                const program = (template.event.program ||= {});
                for (const key of [
                    "registrationOpensAt",
                    "registrationClosesAt",
                    "challengeReleaseAt",
                ])
                    program[key] = defaults.event.program[key];
                program.stages = defaults.event.program.stages.map((s) => ({
                    ...program.stages?.find((old) => old.id === s.id),
                    ...s,
                }));
                template.form.description = defaults.form.description;
                for (const id of ["track", "team", "teamSize"]) {
                    const field = defaults.form.fields.find((f) => f.id === id),
                        index = template.form.fields.findIndex((f) => f.id === id);
                    if (index < 0) template.form.fields.push(field);
                    else template.form.fields[index] = { ...template.form.fields[index], ...field };
                }
                const rules = template.rules || [];
                template.rules = rules.map((rule) => ({
                    ...rule,
                    ...defaults.rules.find((item) => item.id === rule.id),
                }));
                template.rules.push(
                    ...defaults.rules.filter((item) => !rules.some((rule) => rule.id === item.id))
                );
                template.revision = Number(template.revision || 1) + 1;
                template.updatedAt = new Date().toISOString();
                schedule.updatedAt = template.updatedAt;
                schedule.revision = Number(schedule.revision || 1) + 1;
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
            }
            await db.run("INSERT INTO settings(key,value)VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (e) {
        await db.exec("ROLLBACK");
        throw e;
    }
}
module.exports = { migrateHackathonAiXOctober12 };
