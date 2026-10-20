import { expect, test } from "@playwright/test";
import fs from "node:fs";
test.setTimeout(60_000);
const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);
const entry = (track, team, captain, size, extra = {}) => ({
    answers: {
        track: [track],
        team,
        isCaptain: captain,
        teamSize: size,
        contact: "13800138000",
        ...extra,
    },
    createdAt: "2026-10-16T08:00:00Z",
});
const person = (id, name, entries) => ({
    id,
    user_id: id + 100,
    event_key: template.event.key,
    name,
    student_id: `2026${String(id).padStart(4, "0")}`,
    major: "计算机",
    grade: "master",
    created_at: `2026-10-16 08:${String(id).padStart(2, "0")}:00`,
    form_data: {
        name,
        studentId: `2026${id}`,
        major: "计算机",
        grade: "master",
        contact: "13800138000",
        experience: "项目经历",
        trackRegistrations: entries,
    },
});
const records = [
    person(1, "同名甲", {
        industry: entry("industry", "星河队", "yes", "2"),
        campus: entry("campus", "独立项目", "yes", "1", {
            researchExperience: "特殊科研深层关键词",
            experience: "=SUM(1,2)",
        }),
    }),
    person(2, "同名乙", { industry: entry("industry", "星河队", "no", "2") }),
    person(3, "撤销选手", {
        campus: {
            ...entry("campus", "旧队", "yes", "1"),
            active: false,
            cancelledAt: "2026-10-17T00:00:00Z",
        },
    }),
    person(4, "草稿选手", { industry: entry("industry", "待核对队", "no", "3") }),
    ...Array.from({ length: 22 }, (_, i) =>
        person(i + 5, `测试报名者${i + 5}`, {
            campus: entry("campus", `项目队${i + 5}`, "yes", "1"),
        })
    ),
    { ...person(80, "其他届选手", {}), event_key: "other-edition" },
];
const completeForum = {
    name: "论坛听众",
    userId: 101,
    school: "示例大学",
    major: "设计",
    grade: "大三",
    studentId: "20260001",
    contact: "13800138000",
    attendeeType: "internal",
    projectExperience: "项目经历\n第二行",
    researchExperience: "科研经历",
    aiCapabilities: "独立判断，持续行动",
    question: "创业投资如何验证需求？",
    createdAt: "2026-10-20 08:00:00",
};
const forums = [
    { ...completeForum, id: 10, forumKey: "entrepreneurship" },
    { ...completeForum, id: 11, forumKey: "technology" },
    {
        id: 12,
        userId: 102,
        forumKey: "entrepreneurship",
        name: "历史校外听众",
        organization: "示例单位",
        contact: "old@example.test",
        attendeeType: "external",
        createdAt: "2026-10-12 08:00:00",
    },
];

async function openRoster(page, { language = "zh", theme = "day", width = 1440 } = {}) {
    let failForum = true;
    const mutations = [];
    await page.setViewportSize({ width, height: 1050 });
    await page.addInitScript(
        ({ language, theme }) => {
            localStorage.setItem("token", "mock-admin-token");
            localStorage.setItem("i18nextLng", language);
            localStorage.setItem("ui_mode_v3", theme);
        },
        { language, theme }
    );
    await page.route("**/api/**", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname.replace(/^\/api/, "");
        if (request.method() !== "GET") mutations.push({ path, body: request.postData() });
        if (path === "/auth/me")
            return route.fulfill({ json: { id: 1, username: "fixture_admin", role: "admin" } });
        if (path === "/admin/capabilities")
            return route.fulfill({
                json: {
                    scope: "platform",
                    permissions: ["*"],
                    isPlatformAdmin: true,
                    profileIds: [],
                },
            });
        if (path === "/settings") return route.fulfill({ json: { language } });
        if (path === "/admin/hackathon/schedule")
            return route.fulfill({
                json: { events: [template], activeEventKey: template.event.key },
            });
        if (path === "/admin/hackathon/registrations") {
            expect(url.searchParams.get("includeWithdrawn")).toBe("1");
            return route.fulfill({ json: records });
        }
        if (path === "/admin/hackathon/forums/registrations") {
            if (failForum) {
                failForum = false;
                return route.fulfill({ status: 503, json: { error: "fixture failure" } });
            }
            return route.fulfill({ json: { registrations: forums } });
        }
        if (path === "/admin/hackathon/submissions")
            return route.fulfill({
                json: {
                    rows: [
                        {
                            registrationId: 1,
                            userId: 101,
                            track: "industry",
                            submissions: {
                                initial: {
                                    id: 41,
                                    track: "industry",
                                    stage: "initial",
                                    submittedAt: "2026-10-18T08:00:00Z",
                                    submitted: {
                                        projectName: "正式项目",
                                        productHighlights: "完整正式材料",
                                    },
                                    draft: { projectName: "修改草稿" },
                                },
                            },
                        },
                        {
                            registrationId: 4,
                            userId: 104,
                            track: "industry",
                            submissions: {
                                initial: {
                                    id: 44,
                                    track: "industry",
                                    stage: "initial",
                                    draft: { projectName: "尚未提交项目" },
                                },
                            },
                        },
                    ],
                    files: [],
                },
            });
        return route.fulfill({ json: [] });
    });
    await page.goto("/admin?tab=hackathon");
    const later = page.getByRole("button", {
        name: language === "en" ? "Later" : "稍后填写",
        exact: true,
    });
    await later.click();
    await page
        .getByRole("tab", { name: language === "en" ? "Registrations" : "报名", exact: true })
        .click();
    return { mutations };
}

test("registration workspace supports scoped counts, deep search, teams, reading, columns and full exports", async ({
    page,
}) => {
    const { mutations } = await openRoster(page);
    const workspace = page.getByRole("region", { name: "报名数据", exact: true });
    await expect(workspace.locator(".roster-stats > div").first()).toContainText("25");
    await expect(workspace.locator(".roster-stats > div").nth(1)).toContainText("3");
    await expect(workspace.locator(".roster-stats > div").nth(2)).toContainText("23");
    await expect(workspace.getByText("其他届选手", { exact: true })).toHaveCount(0);
    await workspace.getByLabel("搜索报名资料", { exact: true }).fill("特殊科研深层关键词");
    await expect(workspace.locator("tbody tr")).toHaveCount(1);
    await workspace.getByRole("button", { name: "查看 同名甲 的完整资料" }).click();
    const detail = workspace.getByRole("complementary", { name: "报名详情" });
    await expect(detail.getByText("特殊科研深层关键词", { exact: true })).toBeVisible();
    await expect(detail.locator(".roster-detail-submissions summary")).toBeVisible();
    await workspace.getByRole("button", { name: "关闭详情" }).click();
    const download = page.waitForEvent("download");
    await workspace.getByRole("button", { name: "导出筛选结果 1 条" }).click();
    const csv = fs.readFileSync(await (await download).path(), "utf8");
    expect(csv).toContain("特殊科研深层关键词");
    expect(csv).toContain("'=SUM(1,2)");
    await workspace.getByRole("button", { name: "清空筛选" }).click();
    await expect(workspace.locator("tbody tr")).toHaveCount(20);
    await workspace.getByRole("button", { name: "下一页", exact: true }).click();
    await expect(workspace.locator("tbody tr")).toHaveCount(5);
    await workspace.getByRole("combobox", { name: "每页条数", exact: true }).selectOption("50");
    await expect(workspace.locator("tbody tr")).toHaveCount(25);
    await workspace.getByRole("columnheader", { name: /姓名/ }).getByRole("button").click();
    await expect(workspace.getByRole("columnheader", { name: /姓名/ })).toHaveAttribute(
        "aria-sort",
        "ascending"
    );
    await workspace.getByLabel("勾选本页", { exact: true }).check();
    await expect(workspace.getByRole("button", { name: "导出勾选 25 条" })).toBeVisible();
    await workspace.locator(".roster-columns summary").click();
    await workspace.locator(".roster-columns").getByLabel("手机号", { exact: true }).uncheck();
    await expect(workspace.getByRole("columnheader", { name: /手机号/ })).toHaveCount(0);
    await workspace.locator(".roster-columns summary").click();
    await workspace
        .getByRole("combobox", { name: "报名状态", exact: true })
        .selectOption("withdrawn");
    await expect(workspace.locator("tbody tr")).toHaveCount(1);
    await expect(workspace.locator("tbody")).toContainText("撤销选手");
    await workspace.getByRole("button", { name: "清空筛选" }).click();
    await workspace.getByRole("combobox", { name: "赛道", exact: true }).selectOption("industry");
    await workspace.getByRole("combobox", { name: "作品状态", exact: true }).selectOption("draft");
    await expect(workspace.locator("tbody tr")).toHaveCount(1);
    await expect(workspace.locator("tbody")).toContainText("草稿选手");
    await workspace.getByRole("button", { name: "清空筛选" }).click();
    await workspace.getByRole("button", { name: "按填报队名查看", exact: true }).click();
    const group = workspace
        .locator(".roster-teams > details")
        .filter({ has: page.locator("summary strong", { hasText: "星河队" }) });
    await group.locator("summary").click();
    await expect(group).toContainText("已报名 2 人");
    await expect(group).toContainText("填报一致");
    await expect(group.getByRole("button", { name: "同名甲", exact: true })).toBeVisible();
    await workspace.getByRole("button", { name: "人员名单", exact: true }).click();
    await page.screenshot({ path: "output/playwright/roster-desktop-day.png", fullPage: true });
    await workspace.getByRole("button", { name: "查看 同名甲 的完整资料" }).click();
    await page.screenshot({ path: "output/playwright/roster-desktop-detail.png", fullPage: true });
    expect(mutations).toEqual([]);
});

test("forum roster retries failures, distinguishes people from sessions and exposes complete answers and legacy gaps", async ({
    page,
}) => {
    const { mutations } = await openRoster(page);
    const workspace = page.getByRole("region", { name: "报名数据", exact: true });
    await workspace.getByRole("button", { name: "论坛报名", exact: true }).click();
    await expect(workspace.getByRole("alert")).toContainText("论坛报名加载失败");
    await workspace.getByRole("button", { name: "重试", exact: true }).click();
    await expect(workspace.locator(".roster-stats > div").first()).toContainText("2");
    await expect(workspace.locator(".roster-stats > div").nth(1)).toContainText("3");
    await workspace
        .getByRole("combobox", { name: "论坛场次", exact: true })
        .selectOption("entrepreneurship");
    await expect(workspace.locator("tbody tr")).toHaveCount(2);
    await workspace.getByLabel("仅看资料待补充", { exact: true }).check();
    await expect(workspace.locator("tbody tr")).toHaveCount(1);
    await workspace.getByRole("button", { name: "查看 历史校外听众 的完整资料" }).click();
    await expect(workspace.getByRole("complementary")).toContainText("旧报名尚缺以下新必填字段");
    await workspace.getByRole("button", { name: "关闭详情" }).click();
    await workspace.getByLabel("仅看资料待补充", { exact: true }).uncheck();
    await workspace.getByRole("button", { name: "查看 论坛听众 的完整资料" }).click();
    await expect(workspace.getByRole("complementary")).toContainText("独立判断，持续行动");
    await expect(workspace.getByRole("complementary")).toContainText("创业投资如何验证需求？");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    await page.screenshot({ path: "output/playwright/roster-mobile-detail.png", fullPage: true });
    await workspace.getByRole("button", { name: "关闭详情" }).click();
    await workspace.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "output/playwright/roster-mobile-forum.png", fullPage: true });
    expect(mutations).toEqual([]);
});

test("registration table keeps pinned cells in a dark tablet viewport", async ({ page }) => {
    await openRoster(page, { theme: "dark", width: 820 });
    const workspace = page.getByRole("region", { name: "报名数据", exact: true });
    await expect(workspace).toHaveClass(/roster-night/);
    const table = workspace.getByRole("region", { name: "报名表格，可横向和纵向滚动" });
    await table.evaluate((element) => {
        element.scrollLeft = 450;
        element.scrollTop = 250;
    });
    const offsets = await table.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const name = element.querySelector("th.roster-name-cell").getBoundingClientRect();
        return { left: name.left - bounds.left, top: name.top - bounds.top };
    });
    expect(offsets.left).toBeGreaterThanOrEqual(40);
    expect(offsets.left).toBeLessThan(45);
    expect(offsets.top).toBeLessThan(5);
    await page.screenshot({ path: "output/playwright/roster-tablet-dark.png", fullPage: true });
    await page.setViewportSize({ width: 320, height: 740 });
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
});

test("registration workspace provides English controls", async ({ page }) => {
    await openRoster(page, { language: "en" });
    const workspace = page.getByRole("region", { name: "Registration data", exact: true });
    await expect(workspace.getByRole("combobox", { name: "Track", exact: true })).toBeVisible();
    await expect(
        workspace.getByRole("button", { name: "Export 25 filtered records", exact: true })
    ).toBeVisible();
    await workspace.getByRole("button", { name: "Forum", exact: true }).click();
    await expect(workspace.getByRole("alert")).toContainText("Could not load forum registrations");
    await workspace.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(workspace.locator("tbody tr")).toHaveCount(3);
});
