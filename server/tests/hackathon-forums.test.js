const test = require("node:test"),
    assert = require("node:assert/strict"),
    fs = require("node:fs"),
    os = require("node:os"),
    path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-forums-"));
process.env.DATABASE_FILE = path.join(dir, "test.sqlite");
process.env.NODE_ENV = "test";
process.env.SECRET_KEY = "isolated-forum-test-secret";
const express = require("express"),
    jwt = require("jsonwebtoken");
const { getDb, pool } = require("../src/config/db");
const { migrateHackathonForums } = require("../src/config/migrations/hackathonForums");
const controller = require("../src/controllers/hackathonForumController");
const { authenticateToken, isAdmin } = require("../src/middleware/auth");
test("forum signup is independent, private, idempotent, date-bounded and administratively exportable", async () => {
    let server;
    const realNow = Date.now;
    Date.now = () => Date.parse("2026-10-12T14:00:00+08:00");
    try {
        const db = await getDb();
        await db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT,account_type TEXT,review_permission TEXT,admin_scope TEXT,admin_permissions TEXT,auth_version INTEGER DEFAULT 0);
  INSERT INTO users(id,username,role,admin_scope)VALUES(1,'one','user','none'),(2,'two','user','none'),(3,'admin','admin','platform');
  CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER);
  CREATE TABLE hackathon_forum_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL, forum_key TEXT NOT NULL,
    user_id INTEGER NOT NULL, name TEXT NOT NULL, contact TEXT NOT NULL,
    organization TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(event_key,user_id,forum_key)
  );
  INSERT INTO hackathon_forum_registrations(event_key,forum_key,user_id,name,contact)
    VALUES('zhekesong-ai-x-2026','technology',2,'Historical Guest','old@example.test');`);
        await migrateHackathonForums(db);
        await migrateHackathonForums(db);
        const app = express();
        app.use(express.json());
        app.get("/mine", authenticateToken, controller.getMyForums);
        app.post("/signup", authenticateToken, controller.registerForums);
        app.delete("/cancel/:forumKey", authenticateToken, controller.cancelForum);
        app.get("/admin", authenticateToken, isAdmin, controller.getForumRoster);
        app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
        server = app.listen(0, "127.0.0.1");
        await new Promise((r) => server.once("listening", r));
        const base = `http://127.0.0.1:${server.address().port}`;
        const request = async (route, { id = 1, method = "GET", body } = {}) => {
            const r = await fetch(base + route, {
                method,
                headers: {
                    "content-type": "application/json",
                    ...(id
                        ? {
                              authorization:
                                  "Bearer " +
                                  jwt.sign({ id, role: "admin" }, process.env.SECRET_KEY),
                          }
                        : {}),
                },
                ...(body ? { body: JSON.stringify(body) } : {}),
            });
            return {
                status: r.status,
                data: r.headers.get("content-type")?.includes("json") ? await r.json() : null,
                cache: r.headers.get("cache-control"),
            };
        };
        assert.equal(
            (await request("/signup", { id: null, method: "POST", body: {} })).status,
            401
        );
        const payload = {
            sessions: ["technology", "entrepreneurship"],
            name: "Forum Guest",
            contact: "13800138000",
            organization: "Example School",
            attendeeType: "external",
            userId: 2,
            eventKey: "other-edition",
        };
        const history = (await request("/mine", { id: 2 })).data.registrations[0];
        assert.equal(history.contact, "old@example.test");
        for (const field of ["attendeeType", "studentId", "major", "grade", "question"])
            assert.equal(history[field], "");
        await request("/cancel/technology", { id: 2, method: "DELETE" });
        assert.equal(
            (
                await request("/signup", {
                    method: "POST",
                    body: { ...payload, sessions: ["unknown"] },
                })
            ).status,
            400
        );
        assert.equal(
            (await request("/signup", { method: "POST", body: { ...payload, contact: "invalid" } }))
                .status,
            400
        );
        for (const invalid of [
            { contact: "guest@example.test" },
            { contact: "12345678901" },
            { attendeeType: "" },
            { attendeeType: "student" },
            { organization: " " },
            { name: " " },
        ]) {
            assert.equal(
                (await request("/signup", { method: "POST", body: { ...payload, ...invalid } }))
                    .status,
                400
            );
        }
        const first = await request("/signup", { method: "POST", body: payload });
        assert.equal(first.status, 200);
        assert.equal(first.data.registrations.length, 2);
        assert.equal(first.cache, "no-store");
        const ids = first.data.registrations.map((r) => r.id);
        const repeated = await request("/signup", { method: "POST", body: payload });
        assert.deepEqual(
            repeated.data.registrations.map((r) => r.id),
            ids
        );
        const internal = {
            ...payload,
            attendeeType: "internal",
            organization: "",
            studentId: "3260100010",
            major: "计算机科学与技术",
            grade: "2026级",
            question: "如何判断AI创业方向？\n如何验证需求？",
        };
        for (const field of ["studentId", "major", "grade", "question"]) {
            assert.equal(
                (await request("/signup", { method: "POST", body: { ...internal, [field]: " " } }))
                    .status,
                400,
                `${field} is required for internal attendees`
            );
        }
        assert.equal(
            (
                await request("/signup", {
                    method: "POST",
                    body: { ...internal, question: "a".repeat(2001) },
                })
            ).status,
            400
        );
        const internalSaved = await request("/signup", { method: "POST", body: internal });
        assert.equal(internalSaved.status, 200);
        assert.deepEqual(
            internalSaved.data.registrations.map((r) => r.id),
            ids
        );
        for (const field of ["attendeeType", "studentId", "major", "grade", "question"]) {
            assert.equal(internalSaved.data.registrations[0][field], internal[field]);
            assert.equal(
                (await request("/admin", { id: 3 })).data.registrations[0][field],
                internal[field]
            );
        }
        const externalSaved = await request("/signup", {
            method: "POST",
            body: { ...internal, ...payload },
        });
        assert.equal(externalSaved.status, 200);
        assert.equal(externalSaved.data.registrations[0].attendeeType, "external");
        for (const field of ["studentId", "major", "grade", "question"])
            assert.equal(externalSaved.data.registrations[0][field], "");
        const concurrent = await Promise.all([
            request("/signup", { method: "POST", body: payload }),
            request("/signup", { method: "POST", body: payload }),
        ]);
        assert(concurrent.every((r) => r.status === 200));
        assert.equal((await db.get("SELECT COUNT(*) n FROM hackathon_registrations")).n, 0);
        assert.equal((await request("/mine", { id: 2 })).data.registrations.length, 0);
        assert.equal((await request("/admin")).status, 403);
        assert.equal((await request("/admin", { id: 3 })).data.registrations.length, 2);
        await request("/cancel/technology", { id: 2, method: "DELETE" });
        assert.equal((await request("/mine")).data.registrations.length, 2);
        assert.equal(
            (await request("/cancel/technology", { method: "DELETE" })).data.registrations.length,
            1
        );
        const old = await request("/mine");
        Date.now = () => Date.parse("2026-10-18T09:00:00+08:00");
        assert.equal((await request("/signup", { method: "POST", body: payload })).status, 403);
        assert.deepEqual((await request("/mine")).data, old.data);
        assert.equal(
            (
                await request("/signup", {
                    method: "POST",
                    body: { ...payload, sessions: ["entrepreneurship"] },
                })
            ).status,
            200
        );
        Date.now = () => Date.parse("2026-10-25T09:00:00+08:00");
        assert.equal(
            (
                await request("/signup", {
                    method: "POST",
                    body: { ...payload, sessions: ["entrepreneurship"] },
                })
            ).status,
            200
        );
        Date.now = () => Date.parse("2026-10-25T13:30:00+08:00");
        assert.equal(
            (
                await request("/signup", {
                    method: "POST",
                    body: { ...payload, sessions: ["entrepreneurship"] },
                })
            ).status,
            403
        );
    } finally {
        Date.now = realNow;
        if (server) await new Promise((r) => server.close(r));
        await pool.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
