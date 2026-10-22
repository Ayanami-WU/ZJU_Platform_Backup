import { test, expect } from "@playwright/test";

const events = [
    { id: 1801, title: "Next year event", date: "2027-01-02T19:00", end_date: "2027-01-02T21:00" },
    {
        id: 1802,
        title: "Year boundary event",
        date: "2026-12-31T20:00",
        end_date: "2027-01-01T01:00",
    },
    { id: 1803, title: "Unspecified start", date: "待定" },
    { id: 1804, title: "Invalid end", date: "2026-10-23T10:00", end_date: "not-a-date" },
    { id: 1805, title: "Impossible calendar date", date: "2026-02-30" },
    { id: 1806, title: "Current day event", date: "2026-10-22" },
    { id: 1807, title: "Past event", date: "2026-10-20" },
    {
        id: 1808,
        title: "Future registration deadline",
        date: "2026-10-23T10:00",
        registration_deadline: "2026-10-23T18:00",
    },
    {
        id: 1809,
        title: "Expired registration deadline",
        date: "2026-10-23T10:00",
        registration_deadline: "2026-10-21T18:00",
    },
    { id: 1810, title: "Unspecified registration deadline", date: "2026-10-23T10:00" },
].map((event) => ({
    ...event,
    category: "lecture",
    location: "Synthetic campus",
    status: "approved",
    description: "Isolated date display verification",
    image: "/images/hero-background.jpg",
    likes: 0,
    views: 0,
}));

async function setup(page, { mobile, theme, language = "zh" }) {
    await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
    );
    await page.clock.setFixedTime(new Date("2026-10-22T10:00:00Z"));
    await page.addInitScript(
        ({ theme, language }) => {
            localStorage.setItem("ui_mode_v3", theme);
            localStorage.setItem("i18nextLng", language);
        },
        { theme, language }
    );
    await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/settings")
            return route.fulfill({ json: { pagination_enabled: "false" } });
        if (url.pathname === "/api/events")
            return route.fulfill({
                json: {
                    data: events,
                    pagination: { total: events.length, page: 1, limit: 12, totalPages: 1 },
                },
            });
        const match = url.pathname.match(/^\/api\/events\/(\d+)$/);
        if (match)
            return route.fulfill({ json: events.find((event) => event.id === Number(match[1])) });
        return route.fulfill({ json: [] });
    });
    await page.goto("/events");
}

for (const mobile of [false, true]) {
    for (const theme of ["dark", "day"]) {
        test(`event years and unknown lifecycle (${mobile ? "mobile" : "desktop"}, ${theme})`, async ({
            page,
        }, testInfo) => {
            await setup(page, { mobile, theme });
            const card = (title) =>
                page
                    .getByTestId("event-card")
                    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
            await expect(card("Next year event")).toContainText("2027.1.2");
            await expect(card("Year boundary event")).toContainText("2026.12.31");
            if (!mobile) await expect(card("Year boundary event")).toContainText("2027.1.1");
            for (const title of ["Unspecified start", "Invalid end", "Impossible calendar date"]) {
                await expect(card(title)).toContainText("未知");
                await expect(card(title)).not.toContainText("已结束");
            }
            if (mobile) await expect(card("Impossible calendar date")).not.toContainText("周");
            await expect(card("Next year event")).toContainText("即将开始");
            await expect(card("Current day event")).toContainText("进行中");
            await expect(card("Past event")).toContainText("已结束");
            await expect(
                card("Future registration deadline").getByTestId("event-registration-status")
            ).toContainText("报名截止：2026.10.23 18:00");
            await expect(
                card("Expired registration deadline").getByTestId("event-registration-status")
            ).toHaveText("报名已截止");
            await expect(
                card("Unspecified registration deadline").getByTestId("event-registration-status")
            ).toHaveCount(0);
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
            ).toBe(true);
            await page.screenshot({ path: testInfo.outputPath("years.png") });
            await card("Impossible calendar date").scrollIntoViewIfNeeded();
            await page.screenshot({ path: testInfo.outputPath("invalid-date.png") });
        });
    }
}

test("English mobile cards retain years and unknown status", async ({ page }) => {
    await setup(page, { mobile: true, theme: "day", language: "en" });
    const cards = page.getByTestId("event-card");
    await expect(cards.filter({ hasText: "Next year event" })).toContainText("2027.1.2");
    await expect(cards.filter({ hasText: "Unspecified start" })).toContainText("Unknown");
    await expect(cards.filter({ hasText: "Current day event" })).toContainText("Ongoing");
    await expect(
        cards
            .filter({ hasText: "Future registration deadline" })
            .getByTestId("event-registration-status")
    ).toContainText("Registration closes 2026.10.23 18:00");
    await expect(
        cards
            .filter({ hasText: "Expired registration deadline" })
            .getByTestId("event-registration-status")
    ).toHaveText("Registration closed");
});

test("event detail shows both years across the year boundary", async ({ page }) => {
    await setup(page, { mobile: false, theme: "day" });
    await page.goto("/events?id=1802");
    const detail = page.getByTestId("event-schedule");
    await expect(detail).toContainText("2026.12.31");
    await expect(detail).toContainText("2027.1.1");
});

test("desktop list keeps years and unknown lifecycle", async ({ page }) => {
    await setup(page, { mobile: false, theme: "day" });
    await page.getByRole("button", { name: "切换到列表视图", exact: true }).click();
    const row = (title) =>
        page
            .getByRole("button")
            .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(row("Next year event")).toContainText("2027.1.2");
    await expect(row("Year boundary event")).toContainText("2027.1.1");
    await expect(row("Unspecified start")).toContainText("未知");
    await expect(row("Past event")).toContainText("已结束");
    await expect(row("Future registration deadline")).toContainText("报名截止：2026.10.23 18:00");
    await expect(row("Expired registration deadline")).toContainText("报名已截止");
});
