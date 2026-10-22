const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const { backupDatabase } = require("../scripts/backup-release-database");
test("release backup includes committed WAL, stays private, and fails without replacing an existing backup", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "release-backup-"));
    const source = path.join(dir, "source.sqlite"),
        target = path.join(dir, "backup.sqlite");
    const db = await open({ filename: source, driver: sqlite3.Database });
    try {
        await db.exec(
            "PRAGMA journal_mode=WAL; CREATE TABLE registrations(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO registrations VALUES(1,'preserve');"
        );
        await backupDatabase(source, target);
        const snapshot = await open({ filename: target, driver: sqlite3.Database });
        try {
            assert.equal((await snapshot.get("SELECT value FROM registrations")).value, "preserve");
        } finally {
            await snapshot.close();
        }
        assert.equal(fs.statSync(target).mode & 0o777, 0o600);
        await assert.rejects(backupDatabase(source, target));
        await assert.rejects(
            backupDatabase(path.join(dir, "missing.sqlite"), path.join(dir, "empty.sqlite"))
        );
        assert.equal(fs.existsSync(path.join(dir, "missing.sqlite")), false);
        assert.equal((await db.get("SELECT value FROM registrations")).value, "preserve");
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("npm backup command creates a verified snapshot and fails for a missing database", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "manual-backup-"));
    const source = path.join(dir, "source.sqlite");
    const destination = path.join(dir, "snapshots");
    const db = await open({ filename: source, driver: sqlite3.Database });
    try {
        await db.exec(
            "PRAGMA journal_mode=WAL; CREATE TABLE fixture(value TEXT); INSERT INTO fixture VALUES('committed WAL');"
        );
        const cli = path.resolve(__dirname, "../scripts/backup-database.js");
        const result = spawnSync(
            process.execPath,
            [cli, "--database", source, "--directory", destination],
            { encoding: "utf8" }
        );
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /SQLite backup verified/);
        const files = fs.readdirSync(destination);
        assert.equal(files.length, 1);
        const snapshot = await open({
            filename: path.join(destination, files[0]),
            driver: sqlite3.Database,
        });
        try {
            assert.equal((await snapshot.get("SELECT value FROM fixture")).value, "committed WAL");
            assert.equal((await snapshot.get("PRAGMA quick_check")).quick_check, "ok");
        } finally {
            await snapshot.close();
        }
        const missing = path.join(dir, "missing.sqlite");
        const failure = spawnSync(
            process.execPath,
            [cli, "--database", missing, "--directory", destination],
            { encoding: "utf8" }
        );
        assert.notEqual(failure.status, 0);
        assert.equal(fs.existsSync(missing), false);
        assert.deepEqual(fs.readdirSync(destination), files);
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
