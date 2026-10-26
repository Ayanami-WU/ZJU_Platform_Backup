#!/usr/bin/env node
const fs = require("node:fs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { importProjectInventory } = require("../src/services/hackathonProjectInventoryService");

async function main() {
    const [filename, manifestPath, ...args] = process.argv.slice(2);
    const apply = args.includes("--apply");
    const expected = args.find((arg) => arg.startsWith("--expected="))?.slice(11);
    if (!filename || !manifestPath || (apply && !expected))
        throw new Error(
            "Usage: import-hackathon-project-inventory.js DATABASE MANIFEST [--apply --expected=FINGERPRINT]"
        );
    const db = await open({ filename, driver: sqlite3.Database, mode: sqlite3.OPEN_READWRITE });
    try {
        await db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000; BEGIN IMMEDIATE");
        const result = await importProjectInventory(
            db,
            JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        );
        if (apply && result.fingerprint !== expected)
            throw new Error("Manifest changed; preview again");
        await db.exec(apply ? "COMMIT" : "ROLLBACK");
        console.log(JSON.stringify({ ...result, applied: apply }));
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
