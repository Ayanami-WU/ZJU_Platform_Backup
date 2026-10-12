import { test, expect } from "@playwright/test";
import fs from "node:fs";
const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);
test("four visible tabs, four paged screens and unpublished results remain guarded", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date("2026-10-08T12:00:00+08:00"));
    await page.addInitScript(() => {
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", "dark");
    });
    await page.route("**/api/hackathon/schedule", (r) =>
        r.fulfill({ json: { events: [template], activeEventKey: template.event.key } })
    );
    await page.goto("/hackathon/2");
    await expect(page.locator(".hx-nav a")).toHaveCount(4);
    await expect(page.locator(".aix-chapters button")).toHaveCount(4);
    await expect(page.locator(".hx-nav a").nth(2)).toContainText("即将揭晓");
    await page.locator(".aix-chapters-toggle").click();
    await page.locator(".aix-chapters button").nth(2).click();
    await expect(page.locator(".aix-chapters button").nth(2)).toHaveAttribute(
        "aria-current",
        "location"
    );
    await expect(page.getByText("6 个获奖团队")).toBeVisible();
    await page.locator(".aix-chapters-toggle").click();
    await page.locator(".aix-chapters button").nth(0).click();
    await expect(page.locator(".aix-chapters button").nth(0)).toHaveAttribute(
        "aria-current",
        "location"
    );
    await expect(page.locator(".hx-nav a[href$='/results']")).toHaveCount(0);
    await page.locator('.hx-nav a[href$="/partners"]').click();
    await expect(page).toHaveURL(/\/hackathon\/2\/partners$/);
    await expect(page.getByRole("heading", { name: "合作阵容", exact: true })).toBeVisible();
    await expect(page.locator(".aix-organizers-group")).toHaveCount(2);
    await expect(page.locator(".aix-partner-panels > div")).toHaveCount(3);
    await expect(page.locator('[data-partner-group="sponsors"] [data-partner]')).toHaveCount(2);
    await expect(
        page.locator('[data-partner-group="companies"] [data-partner="tianmao"]')
    ).toHaveCount(0);
    await expect(
        page.locator('[data-partner-group="companies"] [data-partner="huawei"]')
    ).toHaveCount(0);
    await expect(page.locator(".aix-chapters")).toHaveCount(0);
    await page.goto("/hackathon/2#aix-partners-title");
    await expect(page).toHaveURL(/\/hackathon\/2\/partners$/);
    await page.locator('.hx-nav a[href="/hackathon/2"]').click();
    await expect(page.locator("#aix-partners-title")).toHaveCount(0);
    await expect(page.locator(".aix-chapters button")).toHaveCount(4);
    await page.goto("/hackathon/2/results");
    await expect(page).toHaveURL(/\/hackathon\/2\/results$/);
    await expect(page.locator(".aix-pending-page h1")).toHaveText("赛后公布");
    await page.clock.setFixedTime(new Date("2026-10-26T12:00:00+08:00"));
    await page.reload();
    await expect(page.locator(".aix-pending-page h1")).toHaveText("成果待公布");
    await expect(page.locator(".hx-nav a[href$='/media']")).toHaveCount(0);
    await page.goto("/hackathon/2/media");
    await expect(page).toHaveURL(/\/hackathon\/2\/media$/);
    await expect(page.locator(".hx-nav a")).toHaveCount(4);
});

test("race overview stays usable with an older locale missing track badges", async ({ page }) => {
    const locale = JSON.parse(
        fs.readFileSync(new URL("../public/locales/zh/translation.json", import.meta.url), "utf8")
    );
    delete locale.aix.trackBadges;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem("i18nextLng", "zh"));
    await page.route("**/locales/*/translation.json", (route) => route.fulfill({ json: locale }));
    await page.route("**/api/hackathon/schedule", (route) =>
        route.fulfill({ json: { events: [template], activeEventKey: template.event.key } })
    );
    await page.goto("/hackathon/2#aix-tracks");
    await expect(page.locator(".aix-rule-panel")).toHaveCount(2);
    for (const [index, track] of locale.aix.pages.tracks.entries()) {
        await expect(
            page.locator(".aix-rule-panel").nth(index).locator(".aix-track-badges span")
        ).toHaveText(track.mode.split(/\s*·\s*/));
    }
    await expect(page.getByRole("heading", { name: "出错了", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
});
