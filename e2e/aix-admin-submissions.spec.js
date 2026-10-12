import { expect, test } from "@playwright/test";
import fs from "node:fs";

const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);

test("administrators distinguish draft from submitted material and explicitly grant track qualification", async ({
    page,
}) => {
    let qualified = false;
    const writes = [];
    const downloads = [];
    await page.addInitScript(() => {
        localStorage.setItem("token", "mock-admin-token");
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", "day");
    });
    // Intercept every API request: this test never writes to the development proxy target.
    await page.route("**/api/**", (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^\/api/, "");
        if (path === "/auth/me")
            return route.fulfill({ json: { id: 1, username: "test_admin", role: "admin" } });
        if (path === "/admin/capabilities")
            return route.fulfill({
                json: {
                    scope: "platform",
                    permissions: ["*"],
                    isPlatformAdmin: true,
                    profileIds: [],
                },
            });
        if (path === "/settings") return route.fulfill({ json: { language: "zh" } });
        if (path === "/admin/hackathon/schedule")
            return route.fulfill({
                json: { events: [template], activeEventKey: template.event.key },
            });
        if (path === "/admin/hackathon/submissions/qualification") {
            writes.push(request.postDataJSON());
            qualified = writes.at(-1).qualified;
            return route.fulfill({
                json: {
                    userId: 42,
                    track: "industry",
                    semifinalQualified: qualified,
                    qualificationUpdatedAt: "2026-10-18T12:00:00Z",
                },
            });
        }
        if (path.startsWith("/hackathon/submissions/files/")) {
            downloads.push({ path, authorization: request.headers().authorization });
            return route.fulfill({ contentType: "video/mp4", body: "mock-demo-content" });
        }
        if (path === "/admin/hackathon/submissions")
            return route.fulfill({
                json: {
                    eventKey: template.event.key,
                    files: [
                        {
                            id: 11,
                            name: "正式Demo.mp4",
                            size: 1024,
                            mimeType: "video/mp4",
                            downloadUrl: "/api/hackathon/submissions/files/11",
                        },
                        {
                            id: 12,
                            name: "草稿Demo.mp4",
                            size: 2048,
                            mimeType: "video/mp4",
                            downloadUrl: "/api/hackathon/submissions/files/12",
                        },
                    ],
                    rows: [
                        {
                            userId: 42,
                            track: "industry",
                            name: "提交测试选手",
                            studentId: "test-42",
                            contact: "test-contact",
                            semifinalQualified: qualified,
                            submissions: {
                                initial: {
                                    id: 1,
                                    submitted: {
                                        projectName: "正式作品",
                                        githubUrl: "https://example.com/submitted",
                                    },
                                    submittedAt: "2026-10-18T08:30:00Z",
                                    draft: {
                                        projectName: "尚未提交的修改",
                                        githubUrl: "javascript:alert(1)",
                                    },
                                    draftUpdatedAt: "2026-10-18T08:40:00Z",
                                },
                                semifinal: {
                                    id: 2,
                                    submitted: {
                                        projectName: "复赛正式作品",
                                        githubUrl: "https://github.com/example/submitted",
                                        demoFileId: 11,
                                    },
                                    submittedAt: "2026-10-23T08:30:00Z",
                                    draft: {
                                        projectName: "复赛修改草稿",
                                        githubUrl: "https://github.com/example/draft",
                                        demoFileId: 12,
                                    },
                                    draftUpdatedAt: "2026-10-23T08:40:00Z",
                                },
                            },
                        },
                    ],
                },
            });
        return route.fulfill({ json: [] });
    });
    await page.goto("/admin?tab=hackathon");
    await page.getByRole("button", { name: "稍后填写", exact: true }).click();
    await page.getByRole("tab", { name: "提交与晋级", exact: true }).click();
    await expect(page.getByText("正式作品", { exact: true })).toBeVisible();
    await expect(page.getByText("尚未提交的修改", { exact: true })).toBeVisible();
    await expect(page.getByText("链接无效", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "打开材料" })).toHaveAttribute(
        "href",
        "https://example.com/submitted"
    );
    await expect(page.getByText("未授予复赛资格", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "设为复赛晋级", exact: true }).click();
    expect(writes).toHaveLength(0);
    await page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByText("已获复赛资格", { exact: true })).toBeVisible();
    expect(writes).toEqual([
        { eventKey: template.event.key, userId: 42, track: "industry", qualified: true },
    ]);
    await page.getByRole("button", { name: "复赛", exact: true }).click();
    await expect(page.getByRole("button", { name: /正式Demo.mp4/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /草稿Demo.mp4/ })).toBeVisible();
    const formalDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /正式Demo.mp4/ }).click();
    expect((await formalDownload).suggestedFilename()).toBe("正式Demo.mp4");
    const draftDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: /草稿Demo.mp4/ }).click();
    expect((await draftDownload).suggestedFilename()).toBe("草稿Demo.mp4");
    expect(downloads).toEqual([
        { path: "/hackathon/submissions/files/11", authorization: "Bearer mock-admin-token" },
        { path: "/hackathon/submissions/files/12", authorization: "Bearer mock-admin-token" },
    ]);
    await page.getByRole("button", { name: "取消复赛资格", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }).click();
    await expect(page.getByText("未授予复赛资格", { exact: true })).toBeVisible();
    expect(writes.at(-1).qualified).toBe(false);
    await page.screenshot({
        path: "output/playwright/admin-submissions-desktop.png",
        fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("提交测试选手", { exact: true })).toBeVisible();
    await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
    await page.screenshot({
        path: "output/playwright/admin-submissions-mobile.png",
        fullPage: true,
    });
});
