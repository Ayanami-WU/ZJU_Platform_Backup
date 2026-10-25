// Rebuild only tables whose constraints changed; preserve IDs, extra columns and indexes.
async function rebuild(db, table, transform) {
    const row = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [
        table,
    ]);
    if (!row) return;
    const sql = transform(row.sql);
    if (sql === row.sql) return;
    const objects = await db.all(
        "SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL",
        [table]
    );
    const columns = (await db.all(`PRAGMA table_info(${table})`))
        .map((c) => `"${c.name}"`)
        .join(",");
    const sequence = await db.get("SELECT seq FROM sqlite_sequence WHERE name=?", [table]);
    const temporary = `${table}_flexible_migration`;
    await db.exec(
        sql.replace(
            new RegExp(`CREATE TABLE [\"\x60]?${table}[\"\x60]?`, "i"),
            `CREATE TABLE ${temporary}`
        )
    );
    await db.exec(
        `INSERT INTO ${temporary} (${columns}) SELECT ${columns} FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${temporary} RENAME TO ${table};`
    );
    for (const object of objects) await db.exec(object.sql);
    if (sequence)
        await db.run("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name=?", [
            sequence.seq,
            table,
        ]);
}

async function migrateHackathonFlexibleRecords(db) {
    const foreignKeys = (await db.get("PRAGMA foreign_keys")).foreign_keys;
    // Foreign keys must be disabled before BEGIN so rebuilding a parent cannot cascade-delete children.
    await db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
    try {
        const before = new Set(
            (await db.all("PRAGMA foreign_key_check")).map((r) => JSON.stringify(r))
        );
        await rebuild(db, "hackathon_registrations", (sql) =>
            sql.replace(/\b(student_id|major|grade|ai_tools) TEXT NOT NULL/g, "$1 TEXT")
        );
        await rebuild(db, "hackathon_submissions", (sql) => {
            if (sql.includes("record_key")) return sql;
            return sql
                .replace("user_id INTEGER NOT NULL", "user_id INTEGER")
                .replace(
                    "version INTEGER",
                    "record_key TEXT NOT NULL DEFAULT 'primary',\n                provenance_json TEXT NOT NULL DEFAULT '{}',\n                version INTEGER"
                )
                .replace(
                    /UNIQUE\s*\(event_key,\s*user_id,\s*track,\s*stage\)/,
                    "UNIQUE(event_key,user_id,track,stage,record_key)"
                );
        });
        const exists = await db.get(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='hackathon_submissions'"
        );
        if (exists)
            await db.exec(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_hackathon_submission_record ON hackathon_submissions(event_key,registration_id,track,stage,record_key)"
            );
        const problems = (await db.all("PRAGMA foreign_key_check")).filter(
            (r) => !before.has(JSON.stringify(r))
        );
        if (problems.length)
            throw new Error("Hackathon migration introduced foreign key violations");
        await db.exec("COMMIT");
    } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
    } finally {
        await db.exec(`PRAGMA foreign_keys=${foreignKeys ? "ON" : "OFF"}`);
    }
}
module.exports = { migrateHackathonFlexibleRecords };
