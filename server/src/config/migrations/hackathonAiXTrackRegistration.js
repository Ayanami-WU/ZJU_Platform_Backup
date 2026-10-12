const MARKER = "hackathon_ai_x_track_registration_phone_v1";
async function migrateHackathonAiXTrackRegistration(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [MARKER]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const event = schedule?.events?.find(
                (item) => item.event?.key === "zhekesong-ai-x-2026"
            );
            const contact = event?.form?.fields?.find((field) => field.id === "contact");
            if (contact) {
                Object.assign(contact, {
                    label: "手机号",
                    type: "tel",
                    placeholder: "填写可接收赛事通知的手机号",
                });
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
            }
            // No signup records are rewritten: historical email and joint-track answers remain evidence.
            await db.run("INSERT INTO settings(key,value) VALUES(?,'1')", [MARKER]);
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
module.exports = { migrateHackathonAiXTrackRegistration };
