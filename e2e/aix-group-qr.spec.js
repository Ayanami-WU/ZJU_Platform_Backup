import { test, expect } from "@playwright/test";
import fs from "node:fs";
const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);

test("official group QR opens, closes with Escape and does not inherit the old QR expiry", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", "dark");
    });
    await page.route("**/api/hackathon/schedule", (route) =>
        route.fulfill({ json: { events: [template], activeEventKey: template.event.key } })
    );
    await page.clock.setFixedTime(new Date("2026-10-16T23:59:00+08:00"));
    await page.goto("/hackathon/2");
    const button = page.getByRole("button", { name: "赛事群" });
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const dialog = page.getByRole("dialog", { name: "赛事群" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("img")).toHaveAttribute(
        "src",
        "/images/hackathon/ai-x/official/wechat-member.png"
    );
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(button).toBeFocused();
    await page.clock.setFixedTime(new Date("2026-10-17T00:00:00+08:00"));
    await page.reload();
    await page.locator(".aix-chapters-toggle").click();
    // Four chapters (01 主页 / 02 赛制 / 03 奖励 / 04 报名); the group-QR button lives
    // on the 报名 chapter. Upstream's nth(4) addressed a fifth chapter that never existed.
    await page.locator(".aix-chapters button").nth(3).click();
    await expect(button).toBeVisible();
    await expect(page.getByText("二维码有效至 10 月 16 日")).toHaveCount(0);
});
