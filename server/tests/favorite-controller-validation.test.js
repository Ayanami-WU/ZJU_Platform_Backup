const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

const secret = "isolated-favorites-test-key";
const tables = {
    photo: "photos",
    music: "music",
    video: "videos",
    article: "articles",
    event: "events",
    project: "project_cards",
};

// Execute the actual modules. Replace only database acquisition and external side effects;
// SQL runs against real in-memory SQLite and permission/JWT helpers remain real.
function loadModule(relativePath, replacements) {
    const filename = path.resolve(__dirname, relativePath);
    const localRequire = createRequire(filename);
    const context = {
        module: { exports: {} },
        console,
        require: (name) =>
            Object.hasOwn(replacements, name) ? replacements[name] : localRequire(name),
    };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
    return context.module.exports;
}

async function fixture(t) {
    const sqlite = new DatabaseSync(":memory:");
    const migration = fs.readFileSync(
        path.resolve(__dirname, "../src/config/runMigrations.js"),
        "utf8"
    );
    sqlite.exec(migration.match(/CREATE TABLE IF NOT EXISTS favorites \([\s\S]*?\n\s*\)/)[0]);
    sqlite.exec(`CREATE TABLE users (
        id INTEGER PRIMARY KEY, username TEXT, nickname TEXT, role TEXT,
        account_type TEXT DEFAULT 'personal', review_permission TEXT DEFAULT 'normal',
        admin_scope TEXT, admin_permissions TEXT, auth_version INTEGER DEFAULT 0
    )`);
    const actors = [
        [1, "viewer", "user", null, "[]", "normal"],
        [2, "owner", "user", null, "[]", "normal"],
        [3, "admin", "admin", "platform", "[]", "normal"],
        [4, "reviewer", "operator", "operations", '["admin.review.manage"]', "normal"],
        [5, "content", "operator", "operations", '["admin.content.manage"]', "normal"],
        [6, "events", "operator", "operations", '["admin.events.manage"]', "normal"],
        [7, "trusted", "user", null, "[]", "trusted"],
    ];
    for (const actor of actors)
        sqlite
            .prepare(
                "INSERT INTO users (id, username, role, admin_scope, admin_permissions, review_permission) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .run(...actor);
    for (const [type, table] of Object.entries(tables)) {
        const owner = type === "project" ? "user_id" : "uploader_id";
        sqlite.exec(
            `CREATE TABLE ${table} (id INTEGER PRIMARY KEY, ${owner} INTEGER, title TEXT, status TEXT, deleted_at TEXT, likes INTEGER DEFAULT 0)`
        );
        sqlite
            .prepare(
                `INSERT INTO ${table} (id, ${owner}, title, status) VALUES (1, 2, 'Synthetic resource', ?)`
            )
            .run(type === "project" ? "published" : "approved");
    }
    const notifications = [];
    const queue = [];
    let failInsert = false;
    const params = (values) =>
        values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
    const db = {
        get: async (sql, ...values) => sqlite.prepare(sql).get(...params(values)),
        run: async (sql, ...values) => {
            if (failInsert && sql.startsWith("INSERT INTO favorites"))
                throw new Error("Synthetic write failure");
            return sqlite.prepare(sql).run(...params(values));
        },
    };
    const dbReplacement = { getDb: async () => db };
    const controller = loadModule("../src/controllers/favoriteController.js", {
        "../config/db": dbReplacement,
        "./notificationController": {
            createNotification: async (...args) => notifications.push(args),
        },
        "../services/userEventAiProfileService": {
            enqueueProfileRefresh: async (...args) => queue.push(args),
        },
    });
    const { authenticateToken } = loadModule("../src/middleware/auth.js", {
        "../config/db": dbReplacement,
        "../controllers/authController": { SECRET_KEY: secret },
    });
    const app = express();
    app.use(express.json());
    app.post("/api/favorites/toggle", authenticateToken, controller.toggleFavorite);
    app.use(require("../src/middleware/errorHandler"));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        sqlite.close();
    });
    return {
        sqlite,
        notifications,
        queue,
        failInsert: () => {
            failInsert = true;
        },
        async request(body, actor = 1, tokenOverride) {
            const token =
                tokenOverride ?? (actor ? jwt.sign({ id: actor, auth_version: 0 }, secret) : null);
            const response = await fetch(
                `http://127.0.0.1:${server.address().port}/api/favorites/toggle`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify(body),
                }
            );
            const text = await response.text();
            return {
                status: response.status,
                body: response.headers.get("content-type")?.includes("json")
                    ? JSON.parse(text)
                    : text,
            };
        },
    };
}

function assertNoWrites(f) {
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM favorites").get().n, 0);
    for (const table of Object.values(tables))
        assert.equal(f.sqlite.prepare(`SELECT likes FROM ${table} WHERE id = 1`).get().likes, 0);
    assert.equal(f.notifications.length, 0);
    assert.equal(f.queue.length, 0);
}

test("invalid types and IDs are rejected without favorites, counters or side effects", async (t) => {
    const f = await fixture(t);
    for (const itemType of [
        null,
        "",
        "unsupported",
        "constructor",
        "toString",
        "__proto__",
        ["event"],
        {},
    ]) {
        assert.equal(
            (await f.request({ itemId: 1, itemType })).status,
            400,
            JSON.stringify(itemType)
        );
    }
    for (const itemId of [
        null,
        "",
        0,
        -1,
        1.5,
        "1x",
        "1e0",
        "0x1",
        true,
        [1],
        {},
        Number.MAX_SAFE_INTEGER + 1,
    ]) {
        assert.equal(
            (await f.request({ itemId, itemType: "event" })).status,
            400,
            JSON.stringify(itemId)
        );
    }
    assert.equal((await f.request(null)).status, 400);
    assertNoWrites(f);
});

for (const type of Object.keys(tables)) {
    test(`${type}: legal favorite and removal preserve response fields and counters`, async (t) => {
        const f = await fixture(t);
        const first = await f.request({ itemId: "1", itemType: type });
        assert.deepEqual(first, { status: 200, body: { favorited: true, likes: 1 } });
        assert.equal(f.notifications.length, 1);
        const removed = await f.request({ itemId: 1, itemType: type });
        assert.deepEqual(removed, { status: 200, body: { favorited: false, likes: 0 } });
        assert.equal(f.notifications.length, 1);
        assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM favorites").get().n, 0);
        assert.equal(f.queue.length, type === "event" ? 2 : 0);
    });
    test(`${type}: missing targets do not create favorites`, async (t) => {
        const f = await fixture(t);
        assert.equal((await f.request({ itemId: 999, itemType: type })).status, 404);
        assertNoWrites(f);
    });
}

test("resource visibility respects ownership and scoped review permissions", async (t) => {
    const f = await fixture(t);
    f.sqlite.exec("UPDATE events SET status = 'pending'; UPDATE articles SET status = 'draft';");
    for (const actor of [1, 5, 7])
        assert.equal((await f.request({ itemId: 1, itemType: "event" }, actor)).status, 404);
    for (const actor of [1, 6, 7])
        assert.equal((await f.request({ itemId: 1, itemType: "article" }, actor)).status, 404);
    assertNoWrites(f);
    for (const actor of [2, 3, 4, 6])
        assert.equal((await f.request({ itemId: 1, itemType: "event" }, actor)).status, 200);
    for (const actor of [2, 3, 4, 5])
        assert.equal((await f.request({ itemId: 1, itemType: "article" }, actor)).status, 200);
});

test("deleted media and project drafts are invisible to other users", async (t) => {
    const f = await fixture(t);
    f.sqlite.exec(
        "UPDATE photos SET deleted_at = '2026-10-21'; UPDATE project_cards SET status = 'draft';"
    );
    assert.equal((await f.request({ itemId: 1, itemType: "photo" })).status, 404);
    for (const actor of [1, 4, 5, 6, 7])
        assert.equal((await f.request({ itemId: 1, itemType: "project" }, actor)).status, 404);
    assertNoWrites(f);
    for (const actor of [2, 3])
        assert.equal((await f.request({ itemId: 1, itemType: "project" }, actor)).status, 200);
});

test("removed projects cannot be newly favorited even by owner or admin", async (t) => {
    const f = await fixture(t);
    f.sqlite.exec("UPDATE project_cards SET status = 'removed'");
    for (const actor of [1, 2, 3])
        assert.equal((await f.request({ itemId: 1, itemType: "project" }, actor)).status, 404);
    assertNoWrites(f);
});

test("existing favorites can be removed after target deletion or hiding", async (t) => {
    const f = await fixture(t);
    f.sqlite.exec(
        `INSERT INTO favorites (user_id, item_id, item_type) VALUES (1, 999, 'event'), (1, 1, 'project'); UPDATE project_cards SET status = 'removed', likes = 1;`
    );
    for (const [itemId, itemType] of [
        [999, "event"],
        [1, "project"],
    ]) {
        assert.deepEqual(await f.request({ itemId, itemType }), {
            status: 200,
            body: { favorited: false, likes: 0 },
        });
    }
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM favorites").get().n, 0);
    assert.equal(f.notifications.length, 0);
});

test("authentication rejects missing, forged and revoked tokens", async (t) => {
    const f = await fixture(t);
    const body = { itemId: 1, itemType: "event" };
    assert.equal((await f.request(body, null)).status, 401);
    assert.equal((await f.request(body, 1, jwt.sign({ id: 1 }, "wrong-test-key"))).status, 401);
    f.sqlite.exec("UPDATE users SET auth_version = 1 WHERE id = 1");
    assert.equal((await f.request(body)).status, 401);
    assertNoWrites(f);
});

test("concurrent invalid writes remain rejected and do not mutate data", async (t) => {
    const f = await fixture(t);
    const results = await Promise.all(
        Array.from({ length: 12 }, () => f.request({ itemId: 999, itemType: "event" }))
    );
    assert.ok(results.every(({ status }) => status === 404));
    assertNoWrites(f);
});

test("failed insert produces no counter updates, notifications or queue jobs", async (t) => {
    const f = await fixture(t);
    f.failInsert();
    assert.equal((await f.request({ itemId: 1, itemType: "event" })).status, 500);
    assertNoWrites(f);
});
