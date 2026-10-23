const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const dotenv = require("dotenv");
const {
    buildProductionEnvironment,
    configureProductionEnvironment,
} = require("../scripts/configure-production-env");

test("production environment retires the old IP, preserves custom clients and unrelated settings", () => {
    const original = [
        "# private runtime settings",
        "SECRET_KEY=fixture-secret",
        "PORT=3001",
        "DATABASE_FILE=/existing/database.sqlite",
        "CORS_ALLOWED_ORIGINS=https://tuotuzju.com,http://118.31.78.72",
        "CORS_ORIGIN=https://custom.example",
        'FRONTEND_URL="https://www.tuotuzju.com"',
        "ZJU_QWEN_BASE_URL=http://previous.invalid/v1",
        "",
    ].join("\r\n");
    const endpoint = "http://private-fixture.invalid/v1";
    const first = buildProductionEnvironment(original, endpoint);
    const updated = dotenv.parse(first.content);
    for (const key of ["SECRET_KEY", "PORT", "DATABASE_FILE"]) {
        assert.equal(updated[key], dotenv.parse(original)[key]);
    }
    assert.equal(updated.ZJU_QWEN_BASE_URL, endpoint);
    assert.equal(first.origins.includes("http://118.31.78.72"), false);
    for (const origin of [
        "https://tuotuzju.com",
        "https://www.tuotuzju.com",
        "capacitor://localhost",
        "https://custom.example",
    ]) {
        assert.equal(first.origins.includes(origin), true);
    }
    assert.equal(Object.hasOwn(updated, "CORS_ORIGIN"), false);
    assert.equal(Object.hasOwn(updated, "FRONTEND_URL"), false);
    assert.deepEqual(buildProductionEnvironment(first.content, endpoint), first);
});

test("invalid endpoint fails before changing the environment file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zju-env-test-"));
    const envPath = path.join(dir, ".env");
    const original = "PORT=3001\nSECRET_KEY=fixture-secret\n";
    fs.writeFileSync(envPath, original, { mode: 0o600 });
    try {
        for (const endpoint of [
            undefined,
            "",
            "ftp://fixture.invalid",
            "http://fixture.invalid\nSECRET_KEY=other",
        ]) {
            assert.throws(
                () => configureProductionEnvironment(envPath, endpoint),
                /secret is invalid/
            );
            assert.equal(fs.readFileSync(envPath, "utf8"), original);
        }
        configureProductionEnvironment(envPath, "http://private-fixture.invalid/v1");
        assert.equal(dotenv.parse(fs.readFileSync(envPath, "utf8")).PORT, "3001");
        if (process.platform !== "win32") assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
        assert.deepEqual(fs.readdirSync(dir), [".env"]);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
