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
            expect(data.sessions).toEqual(["entrepreneurship"]);
            expect(data.contact).toBe("13800138000");
            if (data.attendeeType === "internal") expect(data.question).toContain("真实需求");
            else {
                expect(data.organization).toBe("示例单位");
                expect(data.studentId).toBe("");
                expect(data.question).toBe("");
            }
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
    await page.goto("/hackathon/2/forums?session=technology#forum-registration");
    await expect(page.locator(".hx-nav a")).toHaveCount(3);
    await expect(page.locator(".hx-nav a")).toHaveText(["赛事", "论坛", /赛题&提交/]);
    const form = page.locator(".aix-forum-signup form");
    await expect(form.locator('input[type="checkbox"]')).toHaveCount(0);
    await form.getByLabel(/姓名/).fill("论坛测试");
    await form.getByLabel(/手机号/).fill("13800138000");
    await form.getByLabel(/学号/).fill("32600001");
    await form.getByLabel(/专业/).fill("计算机");
    await form.getByLabel(/年级/).fill("大二");
    await form.getByLabel(/想要提问的问题/).fill("AI 创业如何验证真实需求？");
    fail = true;
    await form.locator("button[type=submit]").click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(form.getByLabel(/姓名/)).toHaveValue("论坛测试");
    expect(puts).toBe(1);
    fail = false;
    await form.locator("button[type=submit]").click();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(1);
    await expect(form.getByRole("status")).toContainText("已保存");
    await page.reload();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(1);
    await expect(page.locator(".aix-forum-signup form").getByLabel(/姓名/)).toHaveValue("论坛测试");
    await expect(form.getByLabel(/学号/)).toHaveValue("32600001");
    await form.getByRole("tab", { name: "校外", exact: true }).click();
    await expect(form.getByLabel(/学号/)).toHaveCount(0);
    await expect(form.locator("input:required")).toHaveCount(3);
    await form.getByLabel(/单位或学校/).fill("示例单位");
    await form.locator("button[type=submit]").click();
    await expect(form.getByRole("status")).toContainText("已保存");
    await page.reload();
    await expect(form.getByRole("tab", { name: "校外", exact: true })).toHaveAttribute(
        "aria-selected",
        "true"
    );
    await expect(form.getByLabel(/单位或学校/)).toHaveValue("示例单位");
    await page.locator(".aix-forum-receipt").first().getByRole("button").click();
    await expect(page.locator(".aix-forum-receipt")).toHaveCount(0);
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
    await page.goto("/hackathon/2#registration-form");
    const contestFields = page.locator(".hackathon-form-panel .aix-registration-preview-fields");
    await expect(contestFields).toBeVisible();
    await expect(contestFields.locator("input").first()).toBeDisabled();
    await expect(contestFields.locator("textarea").first()).toBeDisabled();
    await expect(page.locator(".hackathon-form-panel button[type=submit]")).toBeDisabled();
    await expect(
        page.locator(".hackathon-form-panel .aix-registration-login-notice")
    ).toContainText("请先注册或登录");
    await page.goto("/hackathon/2/forums#forum-registration");
    const preview = page.locator(".aix-forum-signup form");
    await expect(preview.getByLabel(/姓名/)).toBeDisabled();
    await expect(preview.getByLabel(/手机号/)).toBeDisabled();
    await expect(preview.getByLabel(/学号/)).toBeDisabled();
    await expect(preview.getByLabel(/想要提问的问题/)).toBeDisabled();
    await preview.getByRole("tab", { name: "校外", exact: true }).click();
    await expect(preview.getByLabel(/单位或学校/)).toBeDisabled();
    await expect(preview.locator("button[type=submit]")).toBeDisabled();
    await page.locator(".aix-forum-signup .aix-registration-login-notice button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "注册", exact: true }).click();
    await expect(dialog.getByLabel(/学号/)).toHaveCount(0);
    await dialog.getByLabel("用户名", { exact: true }).fill("forum_public");
    await dialog.getByLabel("密码", { exact: true }).fill("fixture-password");
    await dialog.getByRole("button", { name: "创建账户", exact: true }).click();
    await expect(page.locator(".aix-forum-signup form")).toBeVisible();
    await expect(page.locator(".aix-forum-signup form").getByLabel(/姓名/)).toBeEnabled();
    expect(payload.registrationContext).toBe("aix-forum");
    expect(payload.registrationProfile).toBeUndefined();
    await expect(page.getByRole("dialog", { name: "完善注册资料" })).toHaveCount(0);
});
