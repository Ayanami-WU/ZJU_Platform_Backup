const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { getAllowedOrigins, isOriginAllowed } = require("../src/utils/cors");

test("production defaults accept official web and native clients without the retired IP", () => {
    const origins = getAllowedOrigins({ NODE_ENV: "production" });
    for (const origin of [
        "https://tuotuzju.com",
        "https://www.tuotuzju.com",
        "capacitor://localhost",
    ]) {
        assert.equal(isOriginAllowed(origin, origins), true);
    }
    for (const origin of ["http://118.31.78.72", "https://unrelated.example", "null"]) {
        assert.equal(isOriginAllowed(origin, origins), false);
    }
    assert.equal(isOriginAllowed(undefined, origins), true);
});

test("explicit production configuration stays authoritative and normalizes aliases", () => {
    const origins = getAllowedOrigins({
        NODE_ENV: "production",
        CORS_ALLOWED_ORIGINS: "https://custom.example/path,invalid,https://custom.example/",
        CORS_ORIGIN: "https://legacy.example",
    });
    assert.deepEqual(origins, ["https://custom.example", "https://legacy.example"]);
    assert.equal(isOriginAllowed("https://tuotuzju.com", origins), false);
});

test("development defaults match both loopback names on the fixed Vite port", () => {
    const origins = getAllowedOrigins({ NODE_ENV: "development" });
    assert.equal(isOriginAllowed("http://localhost:5180", origins), true);
    assert.equal(isOriginAllowed("http://127.0.0.1:5180", origins), true);
    assert.equal(isOriginAllowed("http://localhost:3000", origins), false);
    assert.equal(isOriginAllowed("http://localhost:3001", origins), false);
});

test("production HTTP preflights accept official clients and reject other origins with 403", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-cors-http-"));
    const port = await new Promise((resolve, reject) => {
        const listener = net.createServer();
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", () => {
            const port = listener.address().port;
            listener.close(() => resolve(port));
        });
    });
    const child = spawn(process.execPath, [path.resolve(__dirname, "../index.js")], {
        cwd: dir,
        env: {
            ...process.env,
            NODE_ENV: "production",
            SECRET_KEY: "fixture-cors-http-secret",
            PORT: String(port),
            SERVER_HOST: "127.0.0.1",
            BACKGROUND_TASKS_DISABLED: "1",
            DATABASE_FILE: path.join(dir, "isolated.sqlite"),
            CORS_ALLOWED_ORIGINS: getAllowedOrigins({ NODE_ENV: "production" }).join(","),
            CORS_ORIGIN: "",
            FRONTEND_URL: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let logs = "";
    child.stdout.on("data", (data) => {
        logs += data;
    });
    child.stderr.on("data", (data) => {
        logs += data;
    });
    const base = `http://127.0.0.1:${port}`;
    try {
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            try {
                ready = (await fetch(`${base}/api/health`)).ok;
            } catch {}
            if (ready || child.exitCode !== null) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.equal(ready, true, logs);
        for (const origin of [
            "https://tuotuzju.com",
            "https://www.tuotuzju.com",
            "capacitor://localhost",
        ]) {
            const response = await fetch(`${base}/api/settings`, {
                method: "OPTIONS",
                headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
            });
            assert.equal(response.status, 204);
            assert.equal(response.headers.get("access-control-allow-origin"), origin);
        }
        for (const origin of ["http://118.31.78.72", "https://unrelated.example"]) {
            const response = await fetch(`${base}/api/settings`, {
                method: "OPTIONS",
                headers: { Origin: origin, "Access-Control-Request-Method": "GET" },
            });
            assert.equal(response.status, 403);
            assert.equal(response.headers.has("access-control-allow-origin"), false);
            assert.equal((await response.json()).code, "CORS_ORIGIN_DENIED");
        }
    } finally {
        if (child.exitCode === null) {
            const stopped = new Promise((resolve) => child.once("exit", resolve));
            child.kill("SIGTERM");
            const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
            await stopped;
            clearTimeout(timer);
        }
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
