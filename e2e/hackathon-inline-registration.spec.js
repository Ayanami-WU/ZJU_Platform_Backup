import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const source = JSON.parse(readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url)));
const profile = { name: "测试参赛者", studentId: "TEST-001", major: "计算机", grade: "junior" };
const sampleUser = {
    id: 900001,
    username: "inline-ui-test",
    role: "user",
    account_type: "person",
    registrationProfile: profile,
};
test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
async function prepare(page, { signedIn = true, failure = null, legacy = null } = {}) {
    const template = structuredClone(source);
    let saved = legacy;
    let currentUser = structuredClone(sampleUser);
    const posts = [];
    let failNext = false;
    posts.failNext = () => {
        failNext = true;
    };
    posts.setUser = (user) => {
        currentUser = user;
        saved = null;
    };
    await page.clock.setFixedTime(new Date("2026-10-13T12:00:00+08:00"));
    await page.addInitScript(
        ({ signedIn }) => {
            localStorage.setItem("i18nextLng", "zh");
            if (signedIn) localStorage.setItem("token", "inline-ui-test-token");
        },
        { signedIn }
    );
    // All requests are isolated; no fixture registration reaches the production proxy.
    await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        let status = 200,
            json = {};
        if (url.pathname.endsWith("/hackathon/schedule"))
            json = { events: [template], activeEventKey: template.event.key };
        else if (url.pathname.endsWith("/auth/me")) json = currentUser;
        else if (url.pathname.endsWith("/auth/login"))
            json = { token: "inline-ui-test-token", user: currentUser };
        else if (url.pathname.endsWith("/auth/registration-profile")) {
            currentUser = {
                ...currentUser,
                registrationProfile: route.request().postDataJSON().registrationProfile,
            };
            json = { registrationProfile: currentUser.registrationProfile };
        } else if (url.pathname.endsWith("/hackathon/registration")) json = { registration: saved };
        else if (url.pathname.endsWith("/hackathon/register")) {
            const body = route.request().postDataJSON();
            posts.push(body);
            if (failNext || (failure === "network" && posts.length === 1)) {
                failNext = false;
                status = 503;
                json = { error: "测试：请重试" };
            } else {
                const track = body.answers.track[0];
                const entries = {
                    ...saved?.trackRegistrations,
                    [track]: { answers: body.answers, createdAt: new Date().toISOString() },
                };
                saved = {
                    id: 21,
                    eventKey: body.eventKey,
                    answers: {
                        ...body.answers,
                        track: Object.keys(entries),
                        trackRegistrations: entries,
                    },
                    trackRegistrations: entries,
                };
                json = saved;
                if (failure === "duplicate") {
                    status = 409;
                    json = { error: "已经报名" };
                }
            }
        }
        await route.fulfill({ status, json });
    });
    return posts;
}
async function fillForm(page, phone, experience, fillTeam = true) {
    if (fillTeam) {
        await page.locator("#hackathon-field-team").fill("测试队伍");
        await page.locator("#hackathon-field-teamSize").selectOption("2");
        await page.getByRole("radio", { name: "是", exact: true }).check();
    }
    await page.locator("#hackathon-field-contact").fill(phone);
    await page.locator("#hackathon-field-strengths button").first().click();
    await page.locator("#hackathon-field-aiTools button").first().click();
    await page.locator("#hackathon-field-experience").fill(experience);
    await page.locator("#hackathon-field-researchExperience").fill("暂无科研经历");
}
const formSubmit = (page) => page.locator(".hackathon-contained-form button[type=submit]");
// The track tabs carry an extra AiXTrackPurpose badge, so match on the
// distinguishing part of the label instead of the full accessible name.
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(name) });

test("anonymous registration shows disabled fields and enables them after login", async ({
    page,
}) => {
    const posts = await prepare(page, { signedIn: false });
    await page.goto("/hackathon/2#registration-form");
    await expect(page.locator("#hackathon-field-contact")).toBeDisabled();
    await expect(formSubmit(page)).toBeDisabled();
    await page.locator(".aix-registration-lock-content button").click();
    const auth = page.getByRole("dialog");
    await auth.getByLabel("用户名", { exact: true }).fill("inline-ui-test");
    await auth.getByLabel("密码", { exact: true }).fill("test-only-password");
    await auth.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator("#hackathon-field-contact")).toBeEnabled();
    await expect(page.locator("#hackathon-field-teamSize")).toBeEnabled();
    expect(posts).toHaveLength(0);
});
test("track drafts and receipts stay independent through failure, two submissions and reload", async ({
    page,
}) => {
    const posts = await prepare(page, { failure: "network" });
    await page.goto("/hackathon/2#registration-form");
    await fillForm(page, "13800138000", "华为项目");
    await tab(page, "学科创意赛道").click();
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("");
    await fillForm(page, "13900139000", "天猫项目");
    await page.locator("#hackathon-field-team").fill("天猫四人队");
    await page.locator("#hackathon-field-teamSize").selectOption("4");
    await expect(page.getByRole("radio", { name: "是", exact: true })).toBeChecked();
    await tab(page, "产业命题赛道").click();
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("13800138000");
    await formSubmit(page).click();
    await expect(page.getByText("测试：请重试", { exact: true })).toBeVisible();
    await expect(page.locator("#hackathon-field-experience")).toHaveValue("华为项目");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    expect(posts[1].answers.track).toEqual(["industry"]);
    expect(posts[1].answers.teamSize).toBe("2");
    expect(posts[1].answers.isCaptain).toBe("yes");
    for (const key of ["name", "studentId", "major", "grade"])
        expect(posts[1].answers[key]).toBe(profile[key]);
    await tab(page, "学科创意赛道").click();
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("13900139000");
    await expect(page.locator("#hackathon-field-teamSize")).toHaveValue("4");
    await expect(page.getByRole("radio", { name: "是", exact: true })).toBeChecked();
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    expect(posts[2].answers.track).toEqual(["campus"]);
    expect(posts[2].answers.teamSize).toBe("4");
    expect(posts[2].answers.isCaptain).toBe("yes");
    for (const key of ["name", "studentId", "major", "grade"])
        expect(posts[2].answers[key]).toBe(profile[key]);
    await page.reload();
    await page.locator(".aix-registration-receipt-details summary").click();
    await expect(page.locator(".aix-registration-receipt-details")).toContainText("华为项目");
    await tab(page, "学科创意赛道").click();
    await expect(page.locator(".aix-registration-receipt-details")).toContainText("天猫项目");
    await expect(page.locator(".aix-registration-receipt-details")).toContainText("13900139000");
});
test("duplicate response restores the matching track receipt without resubmitting", async ({
    page,
}) => {
    const posts = await prepare(page, { failure: "duplicate" });
    await page.goto("/hackathon/2#registration-form");
    await fillForm(page, "13800138000", "华为项目");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    await tab(page, "学科创意赛道").click();
    await expect(page.locator("#hackathon-field-contact")).toBeEnabled();
    expect(posts).toHaveLength(1);
});

test("account profile fills both tracks without replacing saved receipts or another account's drafts", async ({
    page,
}) => {
    const posts = await prepare(page);
    await page.goto("/hackathon/2#registration-form");
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("测试参赛者");
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("TEST-001");
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("计算机");
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("大三");
    await fillForm(page, "13800138000", "填写中的项目");
    await page.getByRole("button", { name: "修改资料", exact: true }).click();
    const profileForm = page.getByRole("form", { name: "完善注册资料" });
    await profileForm.getByLabel("姓名", { exact: false }).fill("更新后的姓名");
    await profileForm.getByRole("button", { name: "保存并继续", exact: true }).click();
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("13800138000");
    await expect(page.locator("#hackathon-field-experience")).toHaveValue("填写中的项目");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    expect(posts[0].answers.name).toBe("更新后的姓名");
    await tab(page, "学科创意赛道").click();
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("更新后的姓名");
    await page.getByRole("button", { name: "修改资料", exact: true }).click();
    await profileForm.getByLabel("姓名", { exact: false }).fill("又一次更新");
    await profileForm.getByRole("button", { name: "保存并继续", exact: true }).click();
    await tab(page, "产业命题赛道").click();
    await expect(page.locator(".aix-registration-receipt-details summary")).toContainText(
        "更新后的姓名"
    );
    await tab(page, "学科创意赛道").click();
    await page.locator("#hackathon-field-contact").fill("13900139000");
    await page.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("");
    posts.setUser({
        ...sampleUser,
        id: 900002,
        username: "second-user",
        registrationProfile: {
            name: "第二账号",
            studentId: "SECOND-002",
            major: "工业设计",
            grade: "master",
        },
    });
    await page.locator(".aix-registration-lock-content button").click();
    const auth = page.getByRole("dialog");
    await auth.getByLabel("用户名", { exact: true }).fill("second-user");
    await auth.getByLabel("密码", { exact: true }).fill("test-only-password");
    await auth.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("第二账号");
    await expect(page.locator('dl[aria-label="注册资料"]')).toContainText("SECOND-002");
    await expect(page.locator("#hackathon-field-contact")).toHaveValue("");
    await tab(page, "产业命题赛道").click();
    await expect(page.locator(".aix-repository-receipt")).toHaveCount(0);
    await expect(page.locator("#hackathon-field-experience")).toHaveValue("");
});

test("campus requires a team name and explicit captain choice; anonymous controls remain disabled", async ({
    page,
}) => {
    const posts = await prepare(page);
    await page.goto("/hackathon/2#registration-form");
    await tab(page, "学科创意赛道").click();
    await fillForm(page, "13800138000", "天猫项目", false);
    await page.locator("#hackathon-field-teamSize").selectOption("1");
    await formSubmit(page).click();
    expect(posts).toHaveLength(0);
    await expect(page.locator("#hackathon-error-team")).toBeVisible();
    await expect(page.locator("#hackathon-error-isCaptain")).toBeVisible();
    await page.locator("#hackathon-field-team").fill("个人项目队");
    await page.getByRole("radio", { name: "否", exact: true }).check();
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    expect(posts[0].answers.isCaptain).toBe("no");
    await page.reload();
    await tab(page, "学科创意赛道").click();
    await page.locator(".aix-registration-receipt-details summary").click();
    await expect(page.locator(".aix-registration-receipt-details")).toContainText("是否队长");
    await expect(
        page.locator(".aix-registration-receipt-details dd").filter({ hasText: /^否$/ })
    ).toBeVisible();
});
test("legacy campus receipt can be updated after explicitly completing captain information", async ({
    page,
}) => {
    await prepare(page, {
        legacy: {
            id: 25,
            eventKey: source.event.key,
            answers: { ...profile, track: ["campus"], team: "历史队伍", teamSize: "2" },
        },
    });
    await page.goto("/hackathon/2#registration-form");
    await tab(page, "学科创意赛道").click();
    await page.locator(".aix-registration-receipt-details summary").click();
    await expect(page.locator(".aix-registration-receipt-details")).toContainText("未填写");
    await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByRole("button", { name: "修改报名信息", exact: true }).click();
    await expect(page.locator("#hackathon-field-team")).toHaveValue("历史队伍");
    for (const label of ["是", "否"])
        await expect(page.getByRole("radio", { name: label, exact: true })).not.toBeChecked();
    await fillForm(page, "13800138000", "更新历史项目", false);
    await formSubmit(page).click();
    await expect(page.locator("#hackathon-error-isCaptain")).toBeVisible();
    await page.getByRole("radio", { name: "否", exact: true }).check();
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
});
test("anonymous campus captain radios have no default and are disabled at mobile size", async ({
    page,
}) => {
    await prepare(page, { signedIn: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hackathon/2#registration-form");
    // Phones replace the inline form with the compact chapter; the form itself now
    // lives on its own registration page, reached from the per-track entry buttons.
    await expect(page.locator(".aix-register-chapter")).toBeVisible();
    await expect(page.locator("#hackathon-field-isCaptain")).toHaveCount(0);
    await page.locator('.aix-register-entry-button[data-track="campus"]').click();
    await expect(page).toHaveURL(/\/hackathon\/2\/register\?track=campus$/);
    await expect(page.locator(".aix-register-chapter")).toHaveCount(0);
    for (const label of ["是", "否"]) {
        await expect(page.getByRole("radio", { name: label, exact: true })).toBeDisabled();
        await expect(page.getByRole("radio", { name: label, exact: true })).not.toBeChecked();
    }
});

test("both track registrations can be edited with independent drafts and failed updates preserved", async ({
    page,
}) => {
    const posts = await prepare(page);
    await page.goto("/hackathon/2#registration-form");
    await fillForm(page, "13800138000", "原华为项目");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    await tab(page, "学科创意赛道").click();
    await fillForm(page, "13900139000", "原天猫项目");
    await page.locator("#hackathon-field-team").fill("原队名");
    await page.locator("#hackathon-field-teamSize").selectOption("2");
    await page.getByRole("radio", { name: "是", exact: true }).check();
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    await page.getByRole("button", { name: "修改报名信息", exact: true }).click();
    await expect(page.getByRole("radio", { name: "是", exact: true })).toBeChecked();
    await page.locator("#hackathon-field-team").fill("更新队名");
    await page.getByRole("radio", { name: "否", exact: true }).check();
    await page.locator("#hackathon-field-isCaptain").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "output/playwright/aix-team-captain-desktop.png" });
    await tab(page, "产业命题赛道").click();
    await page.getByRole("button", { name: "修改报名信息", exact: true }).click();
    await expect(page.locator("#hackathon-field-team")).toHaveValue("测试队伍");
    await expect(page.getByRole("radio", { name: "是", exact: true })).toBeChecked();
    await page.locator("#hackathon-field-experience").fill("更新华为项目");
    await tab(page, "学科创意赛道").click();
    await expect(page.locator("#hackathon-field-team")).toHaveValue("更新队名");
    await expect(page.getByRole("radio", { name: "否", exact: true })).toBeChecked();
    posts.failNext();
    await formSubmit(page).click();
    await expect(page.getByText("测试：请重试", { exact: true })).toBeVisible();
    await expect(page.locator("#hackathon-field-team")).toHaveValue("更新队名");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    await tab(page, "产业命题赛道").click();
    await expect(page.locator("#hackathon-field-experience")).toHaveValue("更新华为项目");
    await formSubmit(page).click();
    await expect(page.locator(".aix-repository-receipt")).toBeVisible();
    expect(posts.at(-1).answers.isCaptain).toBe("yes");
    await page.reload();
    await page.getByRole("button", { name: "修改报名信息", exact: true }).click();
    await expect(page.locator("#hackathon-field-experience")).toHaveValue("更新华为项目");
    await tab(page, "学科创意赛道").click();
    await page.getByRole("button", { name: "修改报名信息", exact: true }).click();
    await expect(page.locator("#hackathon-field-team")).toHaveValue("更新队名");
    await expect(page.getByRole("radio", { name: "否", exact: true })).toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    // Phones replace the inline form with the compact chapter; each track opens its
    // own registration page, where the same captain choice stays editable.
    await expect(page.locator(".aix-register-chapter")).toBeVisible();
    await page.screenshot({ path: "output/playwright/aix-team-captain-mobile.png" });
    await page.locator('.aix-register-entry-button[data-track="campus"]').click();
    // Wait for the standalone registration page before touching its controls; sampling
    // the edit button with a bare count() races the mount and silently skips the click.
    await expect(page.locator("[data-standalone]").first()).toBeVisible();
    const editButton = page.getByRole("button", { name: "修改报名信息", exact: true });
    await expect(editButton.first()).toBeVisible();
    await editButton.first().click();
    // The form re-renders once its draft effect lands; assert visibility first so the
    // scroll below never races the re-render.
    await expect(page.locator("#hackathon-field-isCaptain")).toBeVisible();
    await expect(page.getByRole("radio", { name: "否", exact: true })).toBeChecked();
    await page.locator("#hackathon-field-isCaptain").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "output/playwright/aix-team-captain-mobile-form.png" });
});


