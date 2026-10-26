const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const express = require("express");
const jwt = require("jsonwebtoken");

test("private prize banners require current authentication and never return another account's contact", async (t) => {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());
    sqlite.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT,account_type TEXT,review_permission INTEGER,admin_scope TEXT,admin_permissions TEXT,auth_version INTEGER DEFAULT 0);
    INSERT INTO users(id,username,role) VALUES(1,'recipient','user'),(2,'other','user'),(3,'blocked','banned');
    CREATE TABLE notifications(id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,content TEXT,message TEXT,title TEXT,data TEXT,is_read INTEGER);
    INSERT INTO notifications VALUES(1,1,'prize_claim_banner','Synthetic prize contact',NULL,NULL,'{"contact":"synthetic-contact","active":true}',1);`);
    const db = { get: async (sql, values) => sqlite.prepare(sql).get(...values) };
    const load = (relative, replacements) => {
        const filename = path.resolve(__dirname, relative),
            localRequire = createRequire(filename);
        const context = {
            module: { exports: {} },
            console,
            require: (name) =>
                Object.hasOwn(replacements, name) ? replacements[name] : localRequire(name),
        };
        vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
        return context.module.exports;
    };
    const controller = load("../src/controllers/notificationController.js", {
        "../config/db": { getDb: async () => db },
    });
    const secret = "isolated-prize-banner-test";
    const { authenticateToken } = load("../src/middleware/auth.js", {
        "../config/db": { getDb: async () => db },
        "../controllers/authController": { SECRET_KEY: secret },
    });
    const app = express();
    app.get("/banner", authenticateToken, controller.getAccountBanner);
    app.use((err, req, res, next) => {
        void req;
        void next;
        res.status(500).json({ error: err.message });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    t.after(async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    });
    const url = `http://127.0.0.1:${server.address().port}/banner`;
    const get = (id) =>
        fetch(url, { headers: id ? { Authorization: `Bearer ${jwt.sign({ id }, secret)}` } : {} });
    assert.equal((await get()).status, 401);
    assert.equal((await get(3)).status, 401);
    let res = await get(1);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal((await res.json()).banner.contact, "synthetic-contact");
    assert.deepEqual(await (await get(2)).json(), { banner: null });
    sqlite.prepare("UPDATE notifications SET data=? WHERE id=1").run('{"active":false}');
    assert.deepEqual(await (await get(1)).json(), { banner: null });
});
