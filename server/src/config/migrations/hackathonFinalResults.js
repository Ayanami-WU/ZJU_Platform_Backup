async function migrateHackathonFinalResults(db) {
    await db.exec("BEGIN IMMEDIATE");
    try {
        const columns = new Set(
            (await db.all("PRAGMA table_info(competition_works)")).map((column) => column.name)
        );
        for (const [name, definition] of Object.entries({
            track: "TEXT",
            final_score: "REAL",
            entry_code: "TEXT",
            result_source_key: "TEXT",
            result_provenance_json: "TEXT NOT NULL DEFAULT '{}'",
        }))
            if (!columns.has(name))
                await db.exec(`ALTER TABLE competition_works ADD COLUMN ${name} ${definition}`);
        await db.exec(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_result_source ON competition_works(competition_id,result_source_key) WHERE result_source_key IS NOT NULL"
        );
        const marker = "hackathon_ai_x_reward_value_30000_v1";
        if (!(await db.get("SELECT value FROM settings WHERE key=?", [marker]))) {
            const stored = await db.get(
                "SELECT value FROM settings WHERE key='hackathon_schedule_config'"
            );
            const schedule = stored ? JSON.parse(stored.value) : null;
            const event = schedule?.events?.find(
                (item) => item.event?.key === "zhekesong-ai-x-2026"
            );
            if (event) {
                event.event.prizeValue = "30,000";
                event.revision = Number(event.revision || 1) + 1;
                schedule.revision = Number(schedule.revision || 1) + 1;
                event.updatedAt = schedule.updatedAt = new Date().toISOString();
                await db.run("UPDATE settings SET value=? WHERE key='hackathon_schedule_config'", [
                    JSON.stringify(schedule),
                ]);
                await db.run("INSERT INTO settings(key,value) VALUES(?,?)", [marker, "1"]);
            }
        }
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    }
}
module.exports = { migrateHackathonFinalResults };
