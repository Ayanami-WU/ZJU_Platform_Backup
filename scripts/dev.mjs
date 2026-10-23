import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = {
    ...process.env,
    NODE_ENV: "development",
    PORT: "5181",
    SERVER_HOST: process.env.SERVER_HOST || "127.0.0.1",
    BACKGROUND_TASKS_DISABLED: "1",
    VITE_API_PROXY_TARGET: "http://127.0.0.1:5181",
    VITE_API_BASE_URL: "/api",
};
const children = new Set();
let stopping = false;

function shutdown(code, signal = "SIGTERM") {
    if (stopping) return;
    stopping = true;
    process.exitCode = code;
    for (const child of children) child.kill(signal);
}

function start(args, cwd) {
    const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
    children.add(child);
    child.on("error", (error) => {
        console.error(error.message);
        shutdown(1);
    });
    child.on("exit", (code) => {
        children.delete(child);
        shutdown(code ?? 1);
    });
}

process.on("SIGINT", () => shutdown(130, "SIGINT"));
process.on("SIGTERM", () => shutdown(143));
start([path.join(root, "server/index.js")], path.join(root, "server"));
if (!process.argv.includes("--server")) {
    start(
        [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5180"],
        root
    );
}
