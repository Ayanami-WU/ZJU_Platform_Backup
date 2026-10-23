const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

test("demo seed rejects missing or short credentials before opening its database", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-seed-guard-"));
    try {
        for (const [admin, user] of [
            ["", ""],
            ["fixture-admin-password", "short"],
        ]) {
            const result = spawnSync(
                process.execPath,
                [path.resolve(__dirname, "../scripts/seed-platform.js")],
                {
                    cwd: dir,
                    env: {
                        ...process.env,
                        DATABASE_FILE: path.join(dir, "untouched.sqlite"),
                        SEED_ADMIN_PASSWORD: admin,
                        SEED_USER_PASSWORD: user,
                    },
                    encoding: "utf8",
                }
            );
            assert.equal(result.status, 1);
            assert.match(result.stderr, /SEED_(?:ADMIN|USER)_PASSWORD must be set/);
            assert.deepEqual(fs.readdirSync(dir), []);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("development launcher applies local config and stops the sibling after a child failure", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-dev-config-"));
    try {
        for (const folder of ["scripts", "server", "node_modules/vite/bin"])
            fs.mkdirSync(path.join(dir, folder), { recursive: true });
        fs.copyFileSync(
            path.resolve(__dirname, "../../scripts/dev.mjs"),
            path.join(dir, "scripts/dev.mjs")
        );
        const trace = path.join(dir, "trace.jsonl");
        const writeChild = (file, fails) =>
            fs.writeFileSync(
                path.join(dir, file),
                `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({port:process.env.PORT,mode:process.env.NODE_ENV,host:process.env.SERVER_HOST,background:process.env.BACKGROUND_TASKS_DISABLED,proxy:process.env.VITE_API_PROXY_TARGET})+'\\n');
${fails ? "setTimeout(() => process.exit(7), 200);" : "setInterval(() => {}, 1000);"}
`
            );
        writeChild("server/index.js", true);
        writeChild("node_modules/vite/bin/vite.js", false);
        const result = spawnSync(process.execPath, [path.join(dir, "scripts/dev.mjs")], {
            cwd: dir,
            env: {
                ...process.env,
                PORT: "3001",
                NODE_ENV: "production",
                SERVER_HOST: "",
                BACKGROUND_TASKS_DISABLED: "0",
                VITE_API_PROXY_TARGET: "https://fixture.invalid",
            },
            encoding: "utf8",
            timeout: 10000,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 7, result.stderr);
        const children = fs.readFileSync(trace, "utf8").trim().split("\n").map(JSON.parse);
        assert.equal(children.length, 2);
        for (const child of children)
            assert.deepEqual(child, {
                port: "5181",
                mode: "development",
                host: "127.0.0.1",
                background: "1",
                proxy: "http://127.0.0.1:5181",
            });
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test(
    "dependency repair preserves the lockfile and only restarts after successful npm ci",
    { skip: process.platform === "win32" },
    () => {
        for (const fail of [false, true]) {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-install-config-"));
            try {
                fs.mkdirSync(path.join(dir, "scripts"));
                fs.mkdirSync(path.join(dir, "bin"));
                fs.copyFileSync(
                    path.resolve(__dirname, "../scripts/reinstall-dependencies.sh"),
                    path.join(dir, "scripts/reinstall-dependencies.sh")
                );
                fs.writeFileSync(path.join(dir, "package-lock.json"), "fixture lockfile");
                for (const [name, body] of Object.entries({
                    npm: `echo "$*" >> "$TRACE_FILE"; exit ${fail ? 9 : 0}`,
                    pm2: 'echo "pm2 $*" >> "$TRACE_FILE"',
                })) {
                    fs.writeFileSync(path.join(dir, "bin", name), `#!/bin/sh\n${body}\n`, {
                        mode: 0o755,
                    });
                }
                const trace = path.join(dir, "trace");
                const result = spawnSync(
                    "bash",
                    [path.join(dir, "scripts/reinstall-dependencies.sh")],
                    {
                        env: {
                            ...process.env,
                            PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
                            TRACE_FILE: trace,
                            PM2_APP_NAME: "fixture-app",
                        },
                        encoding: "utf8",
                    }
                );
                assert.equal(result.status, fail ? 9 : 0, result.stderr);
                assert.equal(
                    fs.readFileSync(path.join(dir, "package-lock.json"), "utf8"),
                    "fixture lockfile"
                );
                assert.equal(
                    fs.readFileSync(trace, "utf8"),
                    fail
                        ? "ci --omit=dev\n"
                        : "ci --omit=dev\npm2 restart fixture-app --update-env\n"
                );
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    }
);
