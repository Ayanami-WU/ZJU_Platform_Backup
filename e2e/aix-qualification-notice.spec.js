import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const template = JSON.parse(readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url)));

async function prepare(
    page,
    {
        qualified = true,
        registered = true,
        signedIn = true,
        userId = 910001,
        language = "zh",
        theme = "dark",
    } = {}
) {
    let currentQualification = qualified;
    let updatedAt = "2026-10-19T04:00:00Z";
    await page.addInitScript(
        ({ signedIn, language, theme }) => {
            localStorage.setItem("i18nextLng", language);
            localStorage.setItem("ui_mode_v3", theme);
            if (signedIn) sessionStorage.setItem("token", "qualification-local-test");
        },
        { signedIn, language, theme }
    );
    await page.route("**/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        let json = {};
        if (path.endsWith("/hackathon/schedule"))
            json = { events: [template], activeEventKey: template.event.key };
        else if (path.endsWith("/auth/me"))
            json = {
                id: userId,
                username: "qualification-test",
                role: "user",
                registrationProfile: {
                    name: "测试队员",
                    studentId: "TEST-QUAL-001",
                    major: "计算机",
                    grade: "junior",
                },
            };
        else if (path.endsWith("/hackathon/registration")) json = { registration: { id: 1 } };
        else if (path.endsWith("/hackathon/submissions"))
            json = {
                serverNow: Date.parse("2026-10-19T12:00:00+08:00"),
                eventKey: template.event.key,
                tracks: {
                    industry: {
                        registered,
                        semifinalQualified: currentQualification,
                        qualificationUpdatedAt: updatedAt,
                        teamName: "测试晋级队伍",
                        stages: {
                            semifinal: {
                                closesAt: "2026-10-23T00:00:00+08:00",
                                state: "open",
                                canSave: true,
                                canSubmit: true,
                                requiredFields: [
                                    "projectName",
                                    "githubUrl",
                                    "modelscopeUrl",
                                    "bpFileId",
                                    "demoFileId",
                                ],
                            },
                        },
                    },
                },
                submissions: [],
                files: [],
            };
        await route.fulfill({ json });
    });
    return {
        update: (qualified, stamp) => {
            currentQualification = qualified;
            if (stamp) updatedAt = stamp;
        },
    };
}

for (const [width, theme, userId] of [
    [1440, "day", 910001],
    [390, "dark", 910002],
]) {
    test(`${width}px qualified captain or teammate sees the large notice, can dismiss, reopen and enter the semifinal`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await prepare(page, { theme, userId });
        await page.goto("/hackathon/2");
        const dialog = page.getByRole("dialog", { name: "恭喜你 进入复赛！" });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText("测试晋级队伍", { exact: true })).toBeVisible();
        await expect(dialog.locator(".aix-qualification-details")).toContainText("北京时间");
        expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await page.screenshot({
            path: `/tmp/tuotuzju-qualification-review/notice-${width}-${theme}.png`,
        });
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible();
        await page.reload();
        await expect(page.getByRole("button", { name: "已晋级复赛", exact: true })).toBeVisible();
        await expect(dialog).not.toBeVisible();
        await page.getByRole("button", { name: "已晋级复赛", exact: true }).click();
        await expect(dialog).toBeVisible();
        await dialog.getByRole("button", { name: "查看复赛要求与提交作品" }).click();
        await expect(page).toHaveURL(/challenges\?track=industry&stage=semifinal/);
        await expect(dialog).not.toBeVisible();
    });
}

test("unqualified and signed-out visitors do not receive qualification notices", async ({
    page,
}) => {
    await prepare(page, { qualified: false });
    await page.goto("/hackathon/2");
    await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
    await expect(page.locator(".aix-qualification-dialog")).toHaveCount(0);
    await expect(page.locator(".aix-qualified-reopen")).toHaveCount(0);
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page.locator(".aix-qualification-dialog")).toHaveCount(0);
});

test("revocation closes the notice and a fresh qualification can announce again", async ({
    page,
}) => {
    const fixture = await prepare(page);
    await page.goto("/hackathon/2");
    const dialog = page.locator(".aix-qualification-dialog");
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "稍后查看，继续浏览" }).click();
    fixture.update(false);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".aix-qualified-reopen")).toHaveCount(0);
    fixture.update(true, "2026-10-19T05:00:00Z");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(dialog).toBeVisible();
    await page.getByRole("button", { name: "关闭晋级通知" }).click();
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(dialog).toHaveCount(0);
});

test("a qualification retained after a track cancellation is not announced", async ({ page }) => {
    await prepare(page, { qualified: true, registered: false });
    await page.goto("/hackathon/2");
    await expect(page.getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
    await expect(page.locator(".aix-qualification-dialog")).toHaveCount(0);
});

test("English mobile notice fits and its action remains reachable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await prepare(page, { language: "en" });
    await page.goto("/hackathon/2");
    const dialog = page.locator(".aix-qualification-dialog");
    await expect(dialog).toBeVisible();
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await dialog.getByRole("button", { name: "View semifinal requirements and submit" }).click();
    await expect(page).toHaveURL(/stage=semifinal/);
});

for (const importMode of ["file", "paste"]) {
    test(`admin previews exact members before granting qualifications via ${importMode}`, async ({
        page,
    }) => {
        const calls = [];
        await page.addInitScript(() => {
            sessionStorage.setItem("token", "qualification-admin-test");
            localStorage.setItem("i18nextLng", "zh");
        });
        await page.route("**/api/**", async (route) => {
            const path = new URL(route.request().url()).pathname;
            let json = [];
            if (path.endsWith("/auth/me"))
                json = {
                    id: 1,
                    username: "test_admin",
                    role: "admin",
                    registrationProfile: {
                        name: "Admin",
                        studentId: "TEST-A",
                        major: "CS",
                        grade: "junior",
                    },
                };
            else if (path.endsWith("/admin/capabilities"))
                json = {
                    scope: "platform",
                    permissions: ["*"],
                    isPlatformAdmin: true,
                    profileIds: [],
                };
            else if (path.endsWith("/settings")) json = { language: "zh" };
            else if (path.endsWith("/admin/hackathon/schedule"))
                json = { events: [template], activeEventKey: template.event.key };
            else if (path.endsWith("/admin/hackathon/submissions/qualifications/batch")) {
                const body = route.request().postDataJSON();
                calls.push(body);
                json = {
                    rows: body.members.map((m, i) => ({ ...m, userId: i + 10, qualified: false })),
                    fingerprint: "reviewed-fingerprint",
                    applied: body.apply,
                    granted: body.apply ? 2 : undefined,
                };
            } else if (path.endsWith("/admin/hackathon/submissions"))
                json = { rows: [], files: [] };
            await route.fulfill({ json });
        });
        await page.goto("/admin?tab=hackathon");
        await page.getByRole("tab", { name: "提交与晋级", exact: true }).click();
        const members = [
            { name: "测试队长", studentId: "test-1", teamName: "测试队" },
            { name: "测试队友", studentId: "test-2", teamName: "测试队" },
        ];
        if (importMode === "file") {
            await page.getByLabel("导入已核实的华为晋级成员", { exact: true }).setInputFiles({
                name: "reviewed-members.json",
                mimeType: "application/json",
                buffer: Buffer.from(JSON.stringify({ eventKey: template.event.key, members })),
            });
        } else {
            await page.getByText("文件无法选择？粘贴 JSON 名单", { exact: true }).click();
            await page.getByLabel("已核实的 JSON 名单", { exact: true }).fill("invalid json");
            await page.getByRole("button", { name: "核对粘贴的名单", exact: true }).click();
            await expect(page.getByRole("alert")).toBeVisible();
            expect(calls).toHaveLength(0);
            await page
                .getByLabel("已核实的 JSON 名单", { exact: true })
                .fill(JSON.stringify({ eventKey: template.event.key, members }));
            await page.getByRole("button", { name: "核对粘贴的名单", exact: true }).click();
        }
        await expect(page.getByRole("heading", { name: "待确认：2 位华为复赛成员" })).toBeVisible();
        expect(calls).toHaveLength(1);
        expect(calls[0].apply).toBe(false);
        await expect(page.getByRole("cell", { name: "测试队友", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "确认授予这 2 位成员复赛资格" }).click();
        await expect(page.getByText("已核实 2 位成员，新增 2 位复赛资格")).toBeVisible();
        expect(calls[1]).toEqual({
            eventKey: template.event.key,
            members,
            apply: true,
            expectedFingerprint: "reviewed-fingerprint",
        });
    });
}
