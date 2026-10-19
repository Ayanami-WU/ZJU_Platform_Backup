const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const { migrateHackathonSubmissions } = require("../src/config/migrations/hackathonSubmissions");
const { createHackathonSubmissionService } = require("../src/services/hackathonSubmissionService");
const eventKey = "zhekesong-ai-x-2026";

test("reviewed qualification import is exact, atomic, scoped, conflict-aware and repeatable", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qualification-review-"));
    const filename = path.join(dir, "test.sqlite");
    const db = await open({ filename, driver: sqlite3.Database });
    const service = createHackathonSubmissionService({
        filename,
        now: () => Date.parse("2026-10-19T12:00:00+08:00"),
    });
    const members = [
        { studentId: "s1", name: "Captain", teamName: "Team" },
        { studentId: "s2", name: "Teammate", teamName: "Team" },
    ];
    const preview = (changes = {}) =>
        service.batchQualify(9, { eventKey, members, apply: false, ...changes });
    const apply = (fingerprint, changes = {}) =>
        service.batchQualify(9, {
            eventKey,
            members,
            apply: true,
            expectedFingerprint: fingerprint,
            ...changes,
        });
    try {
        await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY);
            INSERT INTO users(id) VALUES(1),(2),(3),(4),(5),(9);
            CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,name TEXT,student_id TEXT,form_data_json TEXT,created_at TEXT);`);
        for (const [id, name, studentId, team, track, extra] of [
            [1, "Captain", "s1", "Team", "industry", {}],
            [2, "Teammate", "s2", "Team", "industry", {}],
            [3, "Different team", "s3", "Team song", "industry", {}],
            [4, "Other track", "s4", "Team", "campus", {}],
            [5, "Cancelled", "s5", "Team", "industry", { active: false }],
        ]) {
            const answers = { name, studentId, team, track: [track] };
            await db.run("INSERT INTO hackathon_registrations VALUES(?,?,?,?,?,?,?)", [
                id,
                eventKey,
                id,
                name,
                studentId,
                JSON.stringify({ trackRegistrations: { [track]: { answers, ...extra } } }),
                "2026-10-18T00:00:00Z",
            ]);
        }
        await db.run("INSERT INTO settings(key,value) VALUES('hackathon_schedule_config',?)", [
            JSON.stringify({
                events: [require("../../shared/hackathonAiX.json")],
                activeEventKey: eventKey,
            }),
        ]);
        await migrateHackathonSubmissions(db);
        const initial = await preview();
        assert.deepEqual(
            initial.rows.map((r) => r.userId),
            [1, 2]
        );
        assert.equal(
            (await db.get("SELECT count(*) AS n FROM hackathon_submission_qualifications")).n,
            0
        );
        for (const wrong of [
            [{ studentId: "s1", name: "Captain", teamName: "Team song" }],
            [{ studentId: "s2", name: "Wrong name", teamName: "Team" }],
            [{ studentId: "s3", name: "Different team", teamName: "Team" }],
            [{ studentId: "s4", name: "Other track", teamName: "Team" }],
            [{ studentId: "s5", name: "Cancelled", teamName: "Team" }],
            [members[0], members[0]],
            [members[0], { studentId: "missing", name: "Missing", teamName: "Team" }],
        ])
            await assert.rejects(() => apply(initial.fingerprint, { members: wrong }));
        assert.equal(
            (await db.get("SELECT count(*) AS n FROM hackathon_submission_qualifications")).n,
            0
        );
        assert.throws(() => preview({ eventKey: "another-event" }));
        await assert.rejects(
            () => apply("stale-fingerprint"),
            (e) => e.status === 409
        );
        const saved = await apply(initial.fingerprint);
        assert.equal(saved.granted, 2);
        const stored = await db.all(
            "SELECT user_id,updated_by,track,updated_at FROM hackathon_submission_qualifications ORDER BY user_id"
        );
        assert.deepEqual(
            stored.map((r) => r.user_id),
            [1, 2]
        );
        assert.ok(stored.every((r) => r.updated_by === 9 && r.track === "industry"));
        const mine = await service.getMine(1, eventKey);
        assert.equal(mine.tracks.industry.semifinalQualified, true);
        assert.equal(mine.tracks.industry.teamName, "Team");
        assert.equal(mine.tracks.industry.qualificationUpdatedAt, stored[0].updated_at);
        assert.equal(
            (await service.getMine(3, eventKey)).tracks.industry.semifinalQualified,
            false
        );
        const next = await preview();
        assert.ok(next.rows.every((r) => r.qualified));
        assert.equal((await apply(next.fingerprint)).granted, 0);
        assert.deepEqual(
            await db.all(
                "SELECT user_id,updated_by,track,updated_at FROM hackathon_submission_qualifications ORDER BY user_id"
            ),
            stored
        );
        await db.run(
            "UPDATE hackathon_submission_qualifications SET qualified=0,updated_at='changed' WHERE user_id=2"
        );
        await assert.rejects(
            () => apply(next.fingerprint),
            (e) => e.status === 409
        );
        assert.equal(
            (
                await db.get(
                    "SELECT qualified FROM hackathon_submission_qualifications WHERE user_id=2"
                )
            ).qualified,
            0
        );
    } finally {
        await db.close();
        await fs.rm(dir, { recursive: true, force: true });
    }
});
