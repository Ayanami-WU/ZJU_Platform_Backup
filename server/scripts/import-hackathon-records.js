#!/usr/bin/env node
// Private JSON manifests are never committed. No schema changes occur in this importer.
const fs = require("node:fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { importHackathonRecords } = require("../src/services/hackathonRecordImportService");

async function main() {
    const [filename, manifestPath, ...args] = process.argv.slice(2);
    const apply = args.includes("--apply");
    const expected = args.find((arg) => arg.startsWith("--expected="))?.slice(11);
    if (!filename || !manifestPath || (apply && !expected))
        throw new Error(
            "Usage: import-hackathon-records.js DATABASE MANIFEST [--apply --expected=PREVIEW_FINGERPRINT]"
        );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const db = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
    try {
        await db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
        const result = await importHackathonRecords(db, manifest);
        if (apply && result.fingerprint !== expected)
            throw new Error("Database or manifest changed since preview; preview again");
        await db.exec(apply ? "COMMIT" : "ROLLBACK");
        const { entries, ...summary } = result;
        console.log(JSON.stringify({ ...summary, applied: apply }));
    } catch (error) {
        await db.exec("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        await db.close();
    }
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
