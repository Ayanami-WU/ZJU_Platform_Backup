import { test, expect } from "@playwright/test";

async function prepare(
    page,
    { recipient = true, loggedIn = true, profile = true, theme = "dark" } = {}
) {
    await page.addInitScript(
        ({ loggedIn, theme }) => {
            if (loggedIn) localStorage.setItem("token", "synthetic-token");
            localStorage.setItem("i18nextLng", "zh");
            localStorage.setItem("ui_mode_v3", theme);
        },
        { loggedIn, theme }
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/**", async (route) => {
        const p = new URL(route.request().url()).pathname;
        if (p === "/api/auth/me")
            return route.fulfill({
                json: {
                    id: 1001,
                    username: "synthetic",
                    role: "user",
                    registrationProfile: profile
                        ? { name: "测试", studentId: "TEST1", grade: "freshman", major: "测试" }
                        : null,
                },
            });
        if (p === "/api/notifications/account-banner")
            return route.fulfill({
                json: {
                    banner: recipient
                        ? {
                              id: 1,
                              message: "请联系 test-contact，领取奖品",
                              contact: "test-contact",
                          }
                        : null,
                },
            });
        return route.fulfill({ json: {} });
    });
    await page.goto("/");
}
for (const width of [390, 1440])
    for (const theme of ["day", "dark"]) {
        test(`recipient banner is visible and reopens after refresh (${width}, ${theme})`, async ({
            page,
        }, info) => {
            await page.setViewportSize({ width, height: 900 });
            await prepare(page, { theme, profile: false });
            const banner = page.getByRole("status", { name: "转发抽奖领奖提醒" });
            await expect(banner).toContainText("请联系 test-contact，领取奖品");
            await expect(page.getByRole("dialog")).toHaveCount(0);
            await banner.screenshot({ path: info.outputPath("banner.png") });
            await banner.getByRole("button", { name: "暂时收起领奖提示" }).click();
            await expect(banner).toHaveCount(0);
            await page.reload();
            await expect(banner).toBeVisible();
        });
    }
test("anonymous and unrelated accounts see no banner", async ({ page }) => {
    await prepare(page, { recipient: false });
    await expect(page.getByRole("status", { name: "转发抽奖领奖提醒" })).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem("token"));
    await page.reload();
    await expect(page.getByRole("status", { name: "转发抽奖领奖提醒" })).toHaveCount(0);
});
