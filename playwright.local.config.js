import { defineConfig, devices } from "@playwright/test";

// Local-only override.
// - The bundled full Chromium is installed, the chromium_headless_shell build
//   is not, so force the real channel.
// - No `webServer` block: `npm run dev` (dev:full) also boots the local backend
//   on :5181, which cannot start here (production DATABASE_FILE path) and its
//   child vite then proxies /api to a dead port. Instead we run the client only
//   with the API proxied to the live backend:
//     VITE_API_PROXY_TARGET=https://tuotuzju.com npm run dev:client
export default defineConfig({
    testDir: "./e2e",
    outputDir: "/tmp/pw-out",
    timeout: 30_000,
    use: {
        baseURL: "http://127.0.0.1:5180",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"], browserName: "chromium", channel: "chromium" },
        },
    ],
});
