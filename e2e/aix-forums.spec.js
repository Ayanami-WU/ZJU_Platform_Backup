import { test, expect } from "@playwright/test";
import fs from "node:fs";
const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);
test("independent forum signup preserves inputs on failure, stores receipts, restores and cancels one session", async ({
    page,
}) => {
    let rows = [],
        fail = false,
        puts = 0;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date("2026-10-12T14:00:00+08:00"));
    await page.addInitScript(() => {
        localStorage.setItem("token", "forum-fixture");
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", "dark");
    });
    await page.route("**/api/**", async (route) => {
        const req = route.request(),
            url = new URL(req.url());
        if (url.pathname === "/api/auth/me")
            return route.fulfill({ json: { id: 42, username: "fixture", role: "user" } });
        if (url.pathname === "/api/hackathon/schedule")
            return route.fulfill({
                json: { events: [template], activeEventKey: template.event.key },
            });
        if (url.pathname === "/api/hackathon/registration")
            return route.fulfill({ json: { registration: null } });
        if (url.pathname === "/api/hackathon/forums/registration")
            return route.fulfill({ json: { registrations: rows } });
        if (url.pathname === "/api/hackathon/forums/register") {
            puts++;
            if (fail) return route.fulfill({ status: 503, json: { error: "test failure" } });
            const data = req.postDataJSON();
            rows = data.sessions.map((forumKey, i) => ({ id: i + 1, forumKey, ...data }));
            return route.fulfill({ json: { registrations: rows } });
        }
        if (url.pathname.startsWith("/api/hackathon/forums/registration/")) {
            rows = rows.filter((r) => r.forumKey !== url.pathname.split("/").at(-1));
            return route.fulfill({ json: { registrations: rows } });
        }
        if (req.method() !== "GET") return route.abort();
        return route.continue();
    });
    await page.goto("/hackathon/2/forums");
    await expect(page.locator(".hx-nav a")).toHaveCount(4);
    await expect(
        page.getByText(
            "华为初赛选手须参加10月18日技术论坛；决赛选手须参加10月25日决赛论坛。论坛需单独报名。"
        )
    ).toBeVisible();
    const form = page.locator(".aix-forum-signup form");
    await form.getByLabel("技术论坛", { exact: true }).check();
    await form.getByLabel("决赛暨创业论坛", { exact: true }).check();
    await form.getByLabel("姓名", { exact: true }).fill("论坛测试");
    await form.getByLabel("手机号码或邮箱").fill("forum@example.test");
    await form.getByLabel("学校／单位（选填）").fill("示例单位");
    fail = true;
    await form.locator("button[type=submit]").click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(form.getByLabel("姓名", { exact: true })).toHaveValue("论坛测试");
    expect(puts).toBe(1);
    fail = false;
    await form.locator("button[type=submit]").click();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(2);
    await expect(form.getByRole("status")).toContainText("已保存");
    await page.reload();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(2);
    await expect(
        page.locator(".aix-forum-signup form").getByLabel("姓名", { exact: true })
    ).toHaveValue("论坛测试");
    await page.locator(".aix-forum-receipt").first().getByRole("button").click();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(1);
});

test("public forum account creation does not request a student ID or grant contestant access", async ({
    page,
}) => {
    let payload;
    await page.addInitScript(() => {
        localStorage.removeItem("token");
        localStorage.setItem("i18nextLng", "zh");
    });
    await page.route("**/api/**", async (route) => {
        const req = route.request(),
            u = new URL(req.url());
        if (u.pathname === "/api/hackathon/schedule")
            return route.fulfill({
                json: { events: [template], activeEventKey: template.event.key },
            });
        if (u.pathname === "/api/auth/register") {
            payload = req.postDataJSON();
            return route.fulfill({
                json: {
                    token: "fixture-new-forum-account",
                    user: {
                        id: 43,
                        username: "forum_public",
                        role: "user",
                        registrationProfile: null,
                    },
                },
            });
        }
        if (u.pathname === "/api/hackathon/registration")
            return route.fulfill({ json: { registration: null } });
        if (u.pathname === "/api/hackathon/forums/registration")
            return route.fulfill({ json: { registrations: [] } });
        if (req.method() !== "GET") return route.abort();
        return route.continue();
    });
    await page.goto("/hackathon/2/forums");
    await page.locator(".aix-forum-signup button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "注册", exact: true }).click();
    await expect(dialog.getByLabel(/学号/)).toHaveCount(0);
    await dialog.getByLabel("用户名", { exact: true }).fill("forum_public");
    await dialog.getByLabel("密码", { exact: true }).fill("fixture-password");
    await dialog.getByRole("button", { name: "创建账户", exact: true }).click();
    await expect(page.locator(".aix-forum-signup form")).toBeVisible();
    expect(payload.registrationContext).toBe("aix-forum");
    expect(payload.registrationProfile).toBeUndefined();
    await expect(page.getByRole("dialog", { name: "完善注册资料" })).toHaveCount(0);
});
