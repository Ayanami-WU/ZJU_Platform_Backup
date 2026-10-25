const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const { migrateHackathonFinalResults } = require("../src/config/migrations/hackathonFinalResults");
const { importHackathonResults } = require("../src/services/hackathonResultImportService");

test("final results preserve explicit ties and unranked third prizes, import atomically and idempotently without public consent or ownership", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE competitions(id INTEGER PRIMARY KEY,slug TEXT,deleted_at TEXT);
            INSERT INTO competitions VALUES(1,'zhekesong-ai-x-2026',NULL);
            CREATE TABLE competition_works(id INTEGER PRIMARY KEY AUTOINCREMENT,competition_id INTEGER,title TEXT,author TEXT,summary TEXT,rank TEXT,award TEXT,sort_order INTEGER,status TEXT,public_consent INTEGER,featured INTEGER,project_id INTEGER,uploader_id INTEGER);
            INSERT INTO competition_works(id,competition_id,title) VALUES(10,1,'Existing work');`);
        const schedule = {
            revision: 2,
            events: [
                {
                    event: { key: "zhekesong-ai-x-2026", prizeValue: "27,500" },
                    revision: 3,
                    navigation: { resultsVisible: false },
                },
            ],
        };
        await db.run("INSERT INTO settings VALUES('hackathon_schedule_config',?)", [
            JSON.stringify(schedule),
        ]);
        await migrateHackathonFinalResults(db);
        const migrated = (
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")
        ).value;
        assert.equal(JSON.parse(migrated).events[0].event.prizeValue, "30,000");
        assert.equal(JSON.parse(migrated).events[0].navigation.resultsVisible, false);
        await migrateHackathonFinalResults(db);
        assert.equal(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"))
                .value,
            migrated
        );
        const rows = [3, 4, null].map((rank, i) => ({
            track: "industry",
            team: `Team ${i}`,
            title: `Work ${i}`,
            award: rank === null ? "三等奖" : "二等奖",
            sourceHash: "a".repeat(64),
            sourceRow: i + 1,
            rank,
            score: rank === null ? null : 77.13,
            entryCode: rank === null ? null : `华为${i + 1}`,
        }));
        const manifest = { competitionSlug: "zhekesong-ai-x-2026", rows };
        await db.exec("BEGIN IMMEDIATE");
        const preview = await importHackathonResults(db, manifest);
        await db.exec("ROLLBACK");
        assert.equal((await db.get("SELECT COUNT(*) n FROM competition_works")).n, 1);
        await db.exec("BEGIN IMMEDIATE");
        const applied = await importHackathonResults(db, manifest);
        assert.equal(applied.fingerprint, preview.fingerprint);
        await db.exec("COMMIT");
        const saved = await db.all(
            "SELECT * FROM competition_works WHERE result_source_key IS NOT NULL ORDER BY id"
        );
        assert.deepEqual(
            saved.map((r) => [r.rank, r.final_score]),
            [
                ["3", 77.13],
                ["4", 77.13],
                [null, null],
            ]
        );
        assert.ok(
            saved.every(
                (r) =>
                    !r.public_consent &&
                    !r.featured &&
                    r.project_id === null &&
                    r.uploader_id === null
            )
        );
        const retry = await importHackathonResults(db, manifest);
        assert.equal(retry.skipped, 3);
        assert.equal(retry.inserted, 0);
        await assert.rejects(
            () => importHackathonResults(db, { ...manifest, rows: [{ ...rows[0], score: 80 }] }),
            /changed/
        );
        await db.exec("BEGIN IMMEDIATE");
        await assert.rejects(
            () =>
                importHackathonResults(db, {
                    ...manifest,
                    rows: [
                        { ...rows[0], sourceRow: 4 },
                        { ...rows[1], sourceRow: 5, score: 101 },
                    ],
                }),
            /Invalid result row/
        );
        await db.exec("ROLLBACK");
        assert.equal((await db.get("SELECT COUNT(*) n FROM competition_works")).n, 4);
        assert.equal(
            (await db.get("SELECT title FROM competition_works WHERE id=10")).title,
            "Existing work"
        );
    } finally {
        await db.close();
    }
});
