import { test, expect } from "@playwright/test";
import http from "node:http";

let server;
let apiOrigin;
let mode;
let registrations;

test.beforeAll(async () => {
    server = http.createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        if (req.method === "OPTIONS") return res.writeHead(204).end();
        if (req.url !== "/api/auth/register") return res.writeHead(404).end();
        registrations++;
        req.resume();
        if (mode === "hang") return;
        if (mode === "disconnect") return req.socket.destroy();
        res.setHeader("Content-Type", "application/json");
        if (mode === "invalid") {
            res.writeHead(400).end(JSON.stringify({ error: "Username already exists" }));
            return;
        }
        res.end(
            JSON.stringify({
                token: "local-registration-fixture",
                user: { id: 42, username: "sample_user", role: "user" },
            })
        );
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    apiOrigin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
});

async function openRegistration(page, language = "zh") {
    registrations = 0;
    mode = "hang";
    await page.addInitScript((lng) => {
        localStorage.setItem("i18nextLng", lng);
        localStorage.setItem("ui_mode_v3", "dark");
    }, language);
    await page.route("**/api/**", (route) => {
        if (new URL(route.request().url()).origin === apiOrigin) return route.continue();
        return route.fulfill({ json: {} });
    });
    await page.goto("/");
    await page.evaluate(async (origin) => {
        const { default: api } = await import("/src/services/api.js");
        api.defaults.baseURL = `${origin}/api`;
    }, apiOrigin);
    await page
        .getByRole("button", { name: language === "zh" ? "登录" : "Log In", exact: true })
        .first()
        .click();
    const dialog = page.getByRole("dialog");
    await dialog
        .getByRole("button", { name: language === "zh" ? "注册" : "Sign Up", exact: true })
        .click();
    await dialog.locator('input[autocomplete="username"]').fill("sample_user");
    await dialog.locator('input[type="password"]').fill("Synthetic123!");
    await dialog.locator('input[name="name"]').fill("本地测试");
    await dialog.locator('input[name="studentId"]').fill("32600001");
    await dialog.locator('input[name="major"]').fill("计算机");
    await dialog.locator("select").selectOption("sophomore");
    return { dialog, submit: dialog.locator('button[type="submit"]') };
}

for (const language of ["zh", "en"]) {
    test(`hung registration restores the form after 15 seconds (${language})`, async ({
        page,
    }, testInfo) => {
        test.setTimeout(35000);
        const { dialog, submit } = await openRegistration(page, language);
        await submit.click();
        await expect.poll(() => registrations).toBe(1);
        await expect(submit).toBeDisabled();
        // Clicking the disabled submit must not start a second write.
        await submit.evaluate((button) => button.click());
        await expect(submit).toBeEnabled({ timeout: 18000 });
        const hint =
            language === "zh"
                ? "注册请求超时，请稍后重试；若已提交，可先尝试登录。"
                : "Registration timed out. Please try again later, or try signing in if you already submitted.";
        await expect(page.getByText(hint, { exact: true })).toBeVisible();
        await expect(dialog.locator('input[autocomplete="username"]')).toHaveValue("sample_user");
        expect(registrations).toBe(1);
        expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
        await page.screenshot({
            path: testInfo.outputPath(`registration-timeout-${language}.png`),
        });
        await testInfo.attach("request-count", {
            body: JSON.stringify({ registrations }),
            contentType: "application/json",
        });
    });
}

test("registration recovers from HTTP 400 and can subsequently succeed", async ({ page }) => {
    const { dialog, submit } = await openRegistration(page);
    mode = "invalid";
    await submit.click();
    await expect(page.getByText("用户名已存在", { exact: true })).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(registrations).toBe(1);
    mode = "success";
    await submit.click();
    await expect(dialog).toHaveCount(0);
    expect(registrations).toBe(2);
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBe(
        "local-registration-fixture"
    );
});

test("disconnected registration restores the form without retrying the write", async ({ page }) => {
    const { submit } = await openRegistration(page);
    mode = "disconnect";
    await submit.click();
    await expect.poll(() => registrations).toBe(1);
    await expect(page.getByText("注册失败", { exact: true })).toBeVisible();
    await expect(submit).toBeEnabled();
    expect(registrations).toBe(1);
});
