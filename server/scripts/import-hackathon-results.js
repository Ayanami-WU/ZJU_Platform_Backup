#!/usr/bin/env node
const fs = require("node:fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { importHackathonResults } = require("../src/services/hackathonResultImportService");
async function main() {
    const [filename, source, ...args] = process.argv.slice(2);
    const apply = args.includes("--apply");
    const expected = args.find((arg) => arg.startsWith("--expected="))?.slice(11);
    if (!filename || !source || (apply && !expected))
        throw new Error(
            "Usage: import-hackathon-results.js DATABASE MANIFEST [--apply --expected=PREVIEW_FINGERPRINT]"
        );
    const data = JSON.parse(fs.readFileSync(source, "utf8"));
    const db = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
    try {
        await db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
        const result = await importHackathonResults(db, data);
        if (apply && result.fingerprint !== expected)
            throw new Error("Results changed since preview");
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
