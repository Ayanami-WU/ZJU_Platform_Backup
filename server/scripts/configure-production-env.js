const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { getAllowedOrigins, DEFAULT_PRODUCTION_FALLBACK_ORIGINS } = require("../src/utils/cors");

function buildProductionEnvironment(current, privateEndpoint) {
    try {
        const url = new URL(privateEndpoint);
        if (!["http:", "https:"].includes(url.protocol) || /[\r\n]/.test(privateEndpoint)) {
            throw new Error();
        }
    } catch {
        throw new Error("Private Qwen endpoint secret is invalid.");
    }
    const env = dotenv.parse(current);
    // Consolidate the old aliases without dropping separately configured clients.
    const origins = [
        ...new Set([
            ...getAllowedOrigins({ ...env, NODE_ENV: "production" }).filter(
                (origin) => new URL(origin).hostname !== "118.31.78.72"
            ),
            ...DEFAULT_PRODUCTION_FALLBACK_ORIGINS,
        ]),
    ];
    const lines = current
        .split(/\r?\n/)
        .filter(
            (line) =>
                !/^\s*(?:export\s+)?(?:ZJU_QWEN_BASE_URL|CORS_ALLOWED_ORIGINS|CORS_ORIGIN|FRONTEND_URL)\s*=/.test(
                    line
                )
        );
    while (lines.at(-1) === "") lines.pop();
    lines.push(
        `ZJU_QWEN_BASE_URL=${JSON.stringify(privateEndpoint)}`,
        `CORS_ALLOWED_ORIGINS=${JSON.stringify(origins.join(","))}`,
        ""
    );
    return { content: lines.join("\n"), origins };
}

function configureProductionEnvironment(envPath, privateEndpoint) {
    const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const updated = buildProductionEnvironment(current, privateEndpoint);
    const mode = fs.existsSync(envPath) ? fs.statSync(envPath).mode & 0o777 : 0o600;
    const temporaryPath = `${envPath}.config-${process.pid}.tmp`;
    const descriptor = fs.openSync(temporaryPath, "wx", mode);
    try {
        try {
            fs.writeFileSync(descriptor, updated.content);
        } finally {
            fs.closeSync(descriptor);
        }
        fs.renameSync(temporaryPath, envPath);
    } finally {
        fs.rmSync(temporaryPath, { force: true });
    }
    return updated.origins;
}

module.exports = { buildProductionEnvironment, configureProductionEnvironment };

if (require.main === module) {
    try {
        const envPath = path.join(process.env.APP_ROOT, "server", ".env");
        const origins = configureProductionEnvironment(envPath, process.env.ZJU_QWEN_BASE_URL);
        // Captured by the deploy shell; never print credentials or the private endpoint.
        process.stdout.write(origins.join(","));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
