const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createRequire } = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");

function load(relative, replacements) {
    const filename = path.resolve(__dirname, relative);
    const localRequire = createRequire(filename);
    const context = {
        module: { exports: {} },
        require: (name) =>
            Object.hasOwn(replacements, name) ? replacements[name] : localRequire(name),
        console,
    };
    vm.runInNewContext(fs.readFileSync(filename, "utf8"), context, { filename });
    return context.module.exports;
}

test("settings keep public data separate from authenticated editing", async (t) => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
        CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,role TEXT,
          account_type TEXT,review_permission TEXT,admin_scope TEXT,admin_permissions TEXT,auth_version INTEGER);
        INSERT INTO users VALUES(1,'member','user','personal','normal','none','[]',0);
        INSERT INTO users VALUES(2,'pages','operator','personal','normal','operations','["admin.pages.manage"]',0);
        INSERT INTO users VALUES(3,'admin','admin','personal','normal','platform','[]',0);
        INSERT INTO users VALUES(4,'other','operator','personal','normal','operations','["admin.content.manage"]',0);`);
    const stored = {
        site_title: "Synthetic site",
        hero_title: "Existing hero",
        pagination_enabled: "false",
        theme_accent: "#123456",
        contact_phone: "synthetic-private-phone",
        contact_email: "synthetic@example.invalid",
        contact_address: "Synthetic private address",
        invite_code: "synthetic-invite",
        secret_key: "synthetic-secret",
        admin_password: "synthetic-password",
        unknown_future_key: "synthetic-private-value",
        hackathon_subtitle: "Old event subtitle",
        hackathon_format: "Old event format",
        hackathon_schedule_config: '{"private":"synthetic"}',
        __proto__: null,
    };
    for (const [key, value] of Object.entries(stored))
        sqlite.prepare("INSERT INTO settings VALUES(?,?)").run(key, value);
    const db = {
        all: async (sql, values = []) => sqlite.prepare(sql).all(...values),
        get: async (sql, values = []) => sqlite.prepare(sql).get(...values),
        run: async (sql, values = []) => sqlite.prepare(sql).run(...values),
    };
    const database = { getDb: async () => db };
    const secret = "synthetic-settings-test-secret";
    const auth = load("../src/middleware/auth.js", {
        "../config/db": database,
        "../controllers/authController": { SECRET_KEY: secret },
    });
    const controller = load("../src/controllers/settingsController.js", {
        "../config/db": database,
    });
    const app = express();
    app.get("/api/settings", controller.getSettings);
    app.get(
        "/api/admin/settings",
        auth.authenticateToken,
        auth.requireAdminPermission("admin.pages.manage"),
        controller.getAdminSettings
    );
    app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const token = (id, overrides = {}) => jwt.sign({ id, auth_version: 0, ...overrides }, secret);
    const request = (route, bearer) =>
        fetch(base + route, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
    try {
        await t.test(
            "anonymous response retains appearance but omits contacts, legacy events and unknown keys",
            async () => {
                const response = await request("/api/settings");
                assert.equal(response.status, 200);
                assert.match(response.headers.get("cache-control"), /no-store/);
                const result = await response.json();
                assert.equal(result.site_title, stored.site_title);
                assert.equal(result.hero_title, stored.hero_title);
                assert.equal(result.theme_accent, stored.theme_accent);
                assert.equal(result.pagination_enabled, "false");
                assert.equal(typeof result.footer_acknowledgements, "string");
                for (const key of Object.keys(stored).filter(
                    (key) =>
                        ![
                            "site_title",
                            "hero_title",
                            "theme_accent",
                            "pagination_enabled",
                        ].includes(key)
                ))
                    assert.equal(Object.hasOwn(result, key), false, key);
            }
        );
        await t.test("admin route rejects missing and invalid sessions", async () => {
            for (const bearer of [undefined, "forged", token(3, { auth_version: 1 })])
                assert.equal((await request("/api/admin/settings", bearer)).status, 401);
        });
        await t.test(
            "ordinary users and operators without pages permission cannot read settings",
            async () => {
                for (const id of [1, 4])
                    assert.equal((await request("/api/admin/settings", token(id))).status, 403);
            }
        );
        await t.test(
            "pages operators can read editable contacts but not system or unknown values",
            async () => {
                const response = await request("/api/admin/settings", token(2));
                assert.equal(response.status, 200);
                assert.match(response.headers.get("cache-control"), /private.*no-store/);
                const result = await response.json();
                assert.equal(result.contact_email, stored.contact_email);
                assert.equal(result.contact_phone, stored.contact_phone);
                assert.equal(result.site_title, stored.site_title);
                for (const key of [
                    "invite_code",
                    "theme_accent",
                    "secret_key",
                    "admin_password",
                    "unknown_future_key",
                ])
                    assert.equal(Object.hasOwn(result, key), false, key);
            }
        );
        await t.test(
            "platform admins retain supported editing fields without raw secrets or template blobs",
            async () => {
                const result = await (await request("/api/admin/settings", token(3))).json();
                assert.equal(result.invite_code, stored.invite_code);
                assert.equal(result.theme_accent, stored.theme_accent);
                for (const key of [
                    "secret_key",
                    "admin_password",
                    "unknown_future_key",
                    "hackathon_schedule_config",
                    "hackathon_subtitle",
                ])
                    assert.equal(Object.hasOwn(result, key), false, key);
            }
        );
        await t.test("GET requests do not mutate saved configuration", () => {
            assert.equal(
                sqlite.prepare("SELECT COUNT(*) AS count FROM settings").get().count,
                Object.keys(stored).length
            );
            for (const [key, value] of Object.entries(stored))
                assert.equal(
                    sqlite.prepare("SELECT value FROM settings WHERE key=?").get(key).value,
                    value
                );
        });
    } finally {
        await new Promise((resolve) => server.close(resolve));
        sqlite.close();
    }
});
