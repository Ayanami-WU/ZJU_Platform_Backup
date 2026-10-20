const EVENT_KEY = "zhekesong-ai-x-2026";
const MARKER = "hackathon_ai_x_tmall_campus_brand_oct21_v1";
const DISPLAY_FIELDS = new Set([
    "label",
    "title",
    "description",
    "duration",
    "format",
    "name",
    "content",
    "summary",
    "instructions",
    "placeholder",
    "successMessage",
    "privacyNotice",
    "requiredHint",
    "submitLabel",
]);

function normalizeDisplayNames(value) {
    if (Array.isArray(value)) return value.forEach(normalizeDisplayNames);
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
        if (typeof child === "string" && DISPLAY_FIELDS.has(key)) {
            value[key] = child.replace(/天猫(?!校园)/g, "天猫校园");
        } else if (child && typeof child === "object") {
            normalizeDisplayNames(child);
        }
    }
}

// Rename organizer-controlled display copy in this edition only. Technical IDs,
// registration snapshots, dates, uploaded files and other editions stay intact.
async function migrateHackathonAiXCampusBrand(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        if (!(await db.get("SELECT value FROM settings WHERE key = ?", [MARKER]))) {
            const row = await db.get(
                "SELECT value FROM settings WHERE key = 'hackathon_schedule_config'"
            );
            const schedule = row ? JSON.parse(row.value) : null;
            const current = schedule?.events?.find((item) => item.event?.key === EVENT_KEY);
            if (current) {
                const before = JSON.stringify(current);
                normalizeDisplayNames(current);
                if (JSON.stringify(current) !== before) {
                    current.revision = Number(current.revision || 1) + 1;
                    schedule.revision = Number(schedule.revision || 1) + 1;
                    current.updatedAt = schedule.updatedAt = new Date().toISOString();
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

module.exports = { migrateHackathonAiXCampusBrand };
