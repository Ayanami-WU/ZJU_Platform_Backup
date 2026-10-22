const fs = require("node:fs");
const path = require("node:path");
const { parseArgs } = require("node:util");
const { backupDatabase } = require("./backup-release-database");

async function main() {
    const { values } = parseArgs({
        options: {
            database: { type: "string" },
            directory: { type: "string" },
        },
    });
    require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
    const source = path.resolve(values.database || process.env.DATABASE_FILE || "database.sqlite");
    const directory = path.resolve(values.directory || process.env.BACKUP_DIR || "backups");
    process.umask(0o077);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const destination = path.join(directory, `manual-${Date.now()}-${process.pid}.sqlite`);
    await backupDatabase(source, destination);
    console.log("SQLite backup verified:", path.basename(destination));
}

if (require.main === module)
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });

module.exports = { main };
