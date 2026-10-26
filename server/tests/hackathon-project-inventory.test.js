const test = require("node:test");
const assert = require("node:assert/strict");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const {
    migrateHackathonProjectInventory,
} = require("../src/config/migrations/hackathonProjectInventory");
const {
    registrationFingerprint,
    importProjectInventory,
    readProjectInventory,
} = require("../src/services/hackathonProjectInventoryService");

test("separate contest counts and personal experience; retain explicit members, isolation and idempotence", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(`PRAGMA foreign_keys=ON;
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,name TEXT,major TEXT,grade TEXT,form_data_json TEXT);
            INSERT INTO hackathon_registrations VALUES(1,'event-a','One',NULL,NULL,'{}'),(2,'event-a','Two','Math','junior','{}'),(3,'event-b','Other',NULL,NULL,'{}');`);
        await migrateHackathonProjectInventory(db);
        await migrateHackathonProjectInventory(db);
        await db.run("UPDATE hackathon_registrations SET form_data_json=? WHERE id=1", [
            JSON.stringify({ track: ["industry"], experience: "Another reported project" }),
        ]);
        await db.run("UPDATE hackathon_registrations SET form_data_json=? WHERE id=2", [
            JSON.stringify({ track: ["industry"], researchExperience: "Reported research" }),
        ]);
        await db.run(
            "INSERT INTO hackathon_registrations VALUES(4,'event-a','Text only',NULL,NULL,?)",
            [JSON.stringify({ track: ["industry"], experience: "无" })]
        );
        await db.run(
            "INSERT INTO hackathon_registrations VALUES(5,'event-a','Blank',NULL,NULL,'{}')"
        );
        const originals = await db.all("SELECT * FROM hackathon_registrations ORDER BY id");
        const manifest = {
            eventKey: "event-a",
            snapshotAt: "2026-10-26T00:00:00Z",
            registrations: originals
                .filter((r) => r.event_key === "event-a")
                .map((r) => ({ id: r.id, hash: registrationFingerprint(r) })),
            contestProjects: [
                {
                    key: "team-a",
                    track: "industry",
                    team: "One team",
                    title: "",
                    discipline: "Business",
                    industry: "Retail",
                    evidenceKind: "brief",
                    evidence: { registrationIds: [1, 2] },
                },
            ],
            personalProjects: [
                {
                    key: "research",
                    title: "Shared research",
                    discipline: "Science",
                    industry: "Research",
                    members: [1, 2].map((id) => ({
                        registrationId: id,
                        sources: [
                            {
                                track: "industry",
                                field: "researchExperience",
                                text: "Reported research",
                            },
                        ],
                    })),
                },
                {
                    key: "another",
                    title: "Another project",
                    discipline: "Software",
                    industry: "Tools",
                    members: [
                        {
                            registrationId: 1,
                            sources: [
                                {
                                    track: "campus",
                                    field: "experience",
                                    text: "Another reported project",
                                },
                            ],
                        },
                    ],
                },
            ],
        };
        await db.exec("BEGIN IMMEDIATE");
        const preview = await importProjectInventory(db, manifest);
        await db.exec("ROLLBACK");
        assert.equal((await readProjectInventory(db, "event-a", "contest")).summary.total, 0);
        await db.exec("BEGIN IMMEDIATE");
        const applied = await importProjectInventory(db, manifest);
        await db.exec("COMMIT");
        assert.deepEqual(applied, preview);
        const personal = await readProjectInventory(db, "event-a", "personal");
        assert.equal(personal.summary.total, 2);
        assert.equal(personal.summary.people, 2);
        assert.equal(personal.summary.links, 3);
        assert.equal(personal.summary.registrations, 4);
        assert.equal(personal.summary.filled, 3);
        assert.equal(personal.summary.textOnly, 1);
        assert.equal(personal.summary.blank, 1);
        assert.equal(personal.profiles.find((p) => p.id === 4).sources[0].text, "无");
        assert.equal((await readProjectInventory(db, "event-a", "contest")).summary.total, 1);
        assert.equal((await readProjectInventory(db, "event-b", "personal")).summary.total, 0);
        assert.equal((await readProjectInventory(db, "event-a", "personal", 2)).summary.total, 1);
        await db.exec("BEGIN IMMEDIATE");
        await importProjectInventory(db, manifest);
        await db.exec("COMMIT");
        assert.deepEqual(await readProjectInventory(db, "event-a", "personal"), personal);
        assert.deepEqual(
            await db.all("SELECT * FROM hackathon_registrations ORDER BY id"),
            originals
        );
        assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
        const bad = structuredClone(manifest);
        bad.personalProjects[0].members[0].registrationId = 3;
        await assert.rejects(importProjectInventory(db, bad), /same-event/);
        bad.personalProjects[0].members[0].registrationId = 1;
        bad.contestProjects.push(bad.contestProjects[0]);
        await assert.rejects(importProjectInventory(db, bad), /Duplicate/);
        await db.run("UPDATE hackathon_registrations SET grade='master' WHERE id=1");
        await assert.rejects(importProjectInventory(db, manifest), /source changed/);
        assert.deepEqual(
            (await readProjectInventory(db, "event-a", "personal")).rows.map((r) => r.title),
            personal.rows.map((r) => r.title)
        );
    } finally {
        await db.close();
    }
});

test("a failed replacement rolls back completely and deletion stays scoped", async () => {
    const db = await open({ filename: ":memory:", driver: sqlite3.Database });
    try {
        await db.exec(
            "PRAGMA foreign_keys=ON; CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,name TEXT,major TEXT,grade TEXT,form_data_json TEXT); INSERT INTO hackathon_registrations VALUES(1,'a','A',NULL,NULL,'{}')"
        );
        await migrateHackathonProjectInventory(db);
        const r = await db.get("SELECT * FROM hackathon_registrations");
        const manifest = {
            eventKey: "a",
            snapshotAt: "2026-10-26T00:00:00Z",
            registrations: [{ id: 1, hash: registrationFingerprint(r) }],
            contestProjects: [],
            personalProjects: [
                {
                    key: "a",
                    title: "A",
                    discipline: "X",
                    industry: "Y",
                    members: [{ registrationId: 1, sources: [{ field: "experience", text: "A" }] }],
                },
            ],
        };
        await db.exec("BEGIN");
        await importProjectInventory(db, manifest);
        await db.exec("COMMIT");
        const before = await readProjectInventory(db, "a", "personal");
        await db.exec(
            "CREATE TRIGGER reject_b BEFORE INSERT ON hackathon_personal_projects WHEN NEW.source_key='b' BEGIN SELECT RAISE(ABORT,'simulated failure'); END;"
        );
        const changed = structuredClone(manifest);
        changed.personalProjects[0].title = "Changed";
        changed.personalProjects.push({ ...changed.personalProjects[0], key: "b" });
        await db.exec("BEGIN");
        await assert.rejects(importProjectInventory(db, changed), /simulated failure/);
        await db.exec("ROLLBACK");
        assert.deepEqual(await readProjectInventory(db, "a", "personal"), before);
        await db.run(
            "INSERT INTO hackathon_personal_projects(event_key,source_key,title,discipline,industry,snapshot_at) VALUES('other','z','Z','X','Y',?)",
            [manifest.snapshotAt]
        );
        manifest.personalProjects = [];
        await db.exec("BEGIN");
        await importProjectInventory(db, manifest);
        await db.exec("COMMIT");
        assert.equal(
            (await db.get("SELECT COUNT(*) n FROM hackathon_personal_project_members")).n,
            0
        );
        assert.equal(
            (
                await db.get(
                    "SELECT COUNT(*) n FROM hackathon_personal_projects WHERE event_key='other'"
                )
            ).n,
            1
        );
    } finally {
        await db.close();
    }
});
