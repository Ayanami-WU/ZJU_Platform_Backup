import { test, expect } from "@playwright/test";

async function prepare(page, theme = "dark") {
    await page.addInitScript((mode) => {
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", mode);
    }, theme);
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.goto("/");
}

async function openLogin(page, mobile) {
    if (mobile) {
        // The compact shell exposes login through the account entry.
        await page.getByRole("button", { name: "我的", exact: true }).click();
    } else {
        await page.getByRole("button", { name: "登录", exact: true }).first().click();
    }
    return page.getByRole("dialog");
}

for (const mobile of [false, true]) {
    for (const theme of ["dark", "day"]) {
        test(`login focus stays in the dialog and returns after Escape (${mobile ? "mobile" : "desktop"}, ${theme})`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize(
                mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }
            );
            await prepare(page, theme);
            const dialog = await openLogin(page, mobile);
            const username = dialog.locator('input[autocomplete="username"]');
            await expect(username).toBeFocused();
            const trigger = await page.evaluateHandle(() => window.__authTrigger);
            // Focus the first/last enabled elements to verify both wrap directions.
            const first = dialog.getByRole("button", { name: "关闭", exact: true });
            const last = dialog.getByRole("button", { name: "注册", exact: true });
            await first.focus();
            await page.keyboard.press("Shift+Tab");
            await expect(last).toBeFocused();
            await page.keyboard.press("Tab");
            await expect(first).toBeFocused();
            await last.click();
            const grade = dialog.locator("select");
            await grade.focus();
            await page.keyboard.press("Tab");
            expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(
                true
            );
            // A script moving focus to the page must not defeat the active trap.
            await page.getByRole("searchbox", { name: "搜索导航网站" }).focus();
            await expect(username).toBeFocused();
            await page.screenshot({
                path: testInfo.outputPath(`auth-${mobile ? "mobile" : "desktop"}-${theme}.png`),
            });
            await page.keyboard.press("Escape");
            await expect(dialog).toHaveCount(0);
            await testInfo.attach("focus-return", {
                body: JSON.stringify(
                    await page.evaluate(() => ({
                        active: document.activeElement?.outerHTML,
                        openerAtClick: window.__authActiveBefore,
                        triggerConnected: window.__authTrigger?.isConnected,
                    }))
                ),
                contentType: "application/json",
            });
            await expect
                .poll(() => page.evaluate(() => document.activeElement === window.__authTrigger))
                .toBe(true);
            await trigger.dispose();
        });
    }
}

test("close button and backdrop restore focus without leaving a modal hash", async ({ page }) => {
    await prepare(page);
    for (const closeWith of ["button", "backdrop"]) {
        const dialog = await openLogin(page, false);
        await expect(dialog.locator('input[autocomplete="username"]')).toBeFocused();
        if (closeWith === "button")
            await dialog.getByRole("button", { name: "关闭", exact: true }).click();
        else await page.mouse.click(8, 8);
        await expect(dialog).toHaveCount(0);
        await expect
            .poll(() => page.evaluate(() => document.activeElement === window.__authTrigger))
            .toBe(true);
        await expect.poll(() => new URL(page.url()).hash).toBe("");
    }
});

test("viewport permits mobile zoom and the dialog remains usable at enlarged text", async ({
    browser,
}, testInfo) => {
    const context = await browser.newContext({
        baseURL: testInfo.project.use.baseURL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
    });
    const page = await context.newPage();
    try {
        await prepare(page);
        const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
        expect(viewport).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/);
        const session = await context.newCDPSession(page);
        await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
        await expect.poll(() => page.evaluate(() => window.visualViewport.scale)).toBe(2);
        await page.screenshot({ path: testInfo.outputPath("homepage-mobile-zoom-200.png") });
        await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
        await page.addStyleTag({ content: "html { font-size: 200%; }" });
        const dialog = await openLogin(page, true);
        await expect(dialog.locator('input[autocomplete="username"]')).toBeFocused();
        await expect(dialog.getByRole("button", { name: "关闭", exact: true })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("auth-mobile-enlarged.png") });
        await page.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
    } finally {
        await context.close();
    }
});

test("programmatic login opening focuses the form and restores the previous field", async ({
    page,
}) => {
    await prepare(page);
    const search = page.getByRole("searchbox", { name: "搜索导航网站" });
    await search.focus();
    await page.evaluate(() => window.dispatchEvent(new Event("open-auth-modal")));
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('input[autocomplete="username"]')).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(search).toBeFocused();
});

test.beforeEach(async ({ page }) => {
    // Remember the real opener without depending on a translated button label.
    await page.addInitScript(() => {
        document.addEventListener(
            "click",
            (event) => {
                const button = event.target.closest("button");
                if (button && !button.closest('[role="dialog"]')) {
                    window.__authTrigger = button;
                    window.__authActiveBefore = document.activeElement?.outerHTML;
                }
            },
            true
        );
    });
});
