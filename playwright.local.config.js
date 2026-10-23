import { defineConfig, devices } from "@playwright/test";
import config from "./playwright.config.js";

// Use the same local backend and server lifecycle as the standard config.
// An already installed Chromium can be selected without hardcoding a machine path.
export default defineConfig({
    ...config,
    outputDir: "test-results/local",
    use: {
        ...config.use,
        baseURL: "http://127.0.0.1:5180",
        trace: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
                browserName: "chromium",
                channel: "chromium",
                launchOptions: {
                    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
                },
            },
        },
    ],
});
