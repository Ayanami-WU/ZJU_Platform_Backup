import { test, expect } from "@playwright/test";
import fs from "node:fs";
const template = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);
const formalMaterials = {
    projectName: "正式项目",
    githubUrl: "https://github.com/test/formal-project",
    modelscopeUrl: "https://formal-project.ms.show/",
    bpFileId: null,
    demoFileId: null,
};
const draftMaterials = {
    ...formalMaterials,
    projectName: "截止前尚未正式提交的修改",
    githubUrl: "https://github.com/test/draft-project",
};
async function prepare(page, { date = "2026-10-18T14:00:00+08:00", failRead = false } = {}) {
    const now = Date.parse(date);
    await page.clock.setFixedTime(new Date(date));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
        localStorage.setItem("token", "fixture");
        localStorage.setItem("i18nextLng", "zh");
        localStorage.setItem("ui_mode_v3", "dark");
    });
    const event = structuredClone(template);
    event.event.program.challenges = [
        {
            id: "published-initial",
            track: "industry",
            stage: "initial",
            published: true,
            title: "正式赛题测试",
            description: "只在当前赛道和阶段显示。",
            briefUrl: "https://example.test/brief",
            submissionUrl: "https://example.test/extra-submit",
        },
        {
            id: "unpublished",
            track: "industry",
            stage: "initial",
            published: false,
            title: "不能显示的未发布题目",
            submissionUrl: "https://example.test/private-submit",
        },
    ];
    const state = {
        failRead,
        reads: 0,
        data: {
            eventKey: event.event.key,
            serverNow: now,
            tracks: Object.fromEntries(
                ["campus", "industry"].map((track) => [
                    track,
                    {
                        registered: true,
                        semifinalQualified: true,
                        stages: Object.fromEntries(
                            event.event.program.trackStages[track].map((stage) => {
                                const status =
                                    stage.id === "final"
                                        ? "presentation"
                                        : now < Date.parse(stage.opensAt)
                                          ? "upcoming"
                                          : now >= Date.parse(stage.closesAt)
                                            ? "closed"
                                            : "open";
                                return [
                                    stage.id,
                                    {
                                        ...stage,
                                        state: status,
                                        canSave: status === "open",
                                        canSubmit: status === "open",
                                        blockedReason:
                                            status === "open"
                                                ? null
                                                : status === "upcoming"
                                                  ? "not_open"
                                                  : status,
                                        requiredFields:
                                            stage.id === "final"
                                                ? []
                                                : [
                                                      "projectName",
                                                      "githubUrl",
                                                      "modelscopeUrl",
                                                      ...(stage.id === "semifinal"
                                                          ? [
                                                                ...(track === "campus"
                                                                    ? ["bpFileId"]
                                                                    : []),
                                                                "demoFileId",
                                                            ]
                                                          : []),
                                                  ],
                                    },
                                ];
                            })
                        ),
                    },
                ])
            ),
            submissions: [
                {
                    id: 1,
                    track: "campus",
                    stage: "initial",
                    version: 3,
                    draft: draftMaterials,
                    draftUpdatedAt: "2026-10-18T16:59:00+08:00",
                    submitted: formalMaterials,
                    submittedAt: "2026-10-18T16:00:00+08:00",
                },
                {
                    id: 2,
                    track: "industry",
                    stage: "initial",
                    version: 1,
                    draft: draftMaterials,
                    draftUpdatedAt: "2026-10-18T16:59:00+08:00",
                    submitted: null,
                    submittedAt: null,
                },
            ],
            files: [],
            legacyRepositories: {
                githubUrl: "https://github.com/test/legacy",
                modelscopeUrl: "",
                updatedAt: "2026-10-12T00:00:00Z",
            },
        },
    };
    // Every API request is mocked: localhost may otherwise proxy production.
    await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/auth/me")
            return route.fulfill({
                json: {
                    id: 42,
                    username: "ui_test",
                    role: "user",
                    registrationProfile: {
                        name: "UI Test",
                        studentId: "UI42",
                        major: "Test",
                        grade: "junior",
                    },
                },
            });
        if (url.pathname === "/api/hackathon/schedule")
            return route.fulfill({ json: { events: [event], activeEventKey: event.event.key } });
        if (url.pathname === "/api/hackathon/submissions" && route.request().method() === "GET") {
            state.reads++;
            return state.failRead
                ? route.fulfill({ status: 503, json: { error: "fixture read failure" } })
                : route.fulfill({ json: state.data });
        }
        if (route.request().method() !== "GET") return route.abort();
        return route.fulfill({ json: {} });
    });
    return state;
}

test("Huawei project URL copy accepts self-hosted links on desktop and mobile without changing campus", async ({
    page,
}) => {
    const state = await prepare(page);
    const writes = [];
    await page.route("**/api/hackathon/submissions", async (route) => {
        if (route.request().method() === "GET") return route.fallback();
        const body = route.request().postDataJSON();
        writes.push(body);
        return route.fulfill({
            json: {
                submission: {
                    ...state.data.submissions.find((record) => record.track === "industry"),
                    version: body.expectedVersion + 1,
                    draft: body.materials,
                    draftUpdatedAt: "2026-10-18T14:00:00+08:00",
                },
                serverNow: state.data.serverNow,
            },
        });
    });
    await page.goto("/hackathon/2/challenges?track=industry&stage=initial");
    await page.getByRole("button", { name: "稍后查看，继续浏览", exact: true }).click();
    const form = page.locator(".aix-task-submission");
    const input = form.getByRole("textbox", { name: /魔搭社区部署链接或作品网址/ });
    for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect(input).toBeVisible();
        await expect(input).toHaveAttribute("placeholder", "填写魔搭社区部署链接或作品网址");
        await expect(page.getByText(/作品网址支持自建服务器及其他平台/)).toBeVisible();
        await page.screenshot({
            path: `output/playwright/modelscope-link-${width}.png`,
            fullPage: true,
        });
    }
    for (const [index, url] of [
        "http://demo.example.com:8080/app",
        "demo.example.com:8080/app",
    ].entries()) {
        await input.fill(url);
        await form.getByRole("button", { name: "保存草稿", exact: true }).click();
        await expect(form.getByRole("alert")).toHaveCount(0);
        await expect(
            form.getByText("草稿已保存，尚未更新正式提交。", { exact: true })
        ).toBeVisible();
        expect(writes).toHaveLength(index + 1);
        expect(writes[index].track).toBe("industry");
        expect(writes[index].materials.modelscopeUrl).toBe(index === 0 ? url : `https://${url}`);
    }
    await page.locator("#task-track-campus").click();
    await expect(page.locator(".aix-submission-channel.is-tmall img")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /魔搭社区部署链接或作品网址/ })).toHaveCount(0);
});

test("published brief and extra entry belong only to the selected track and round", async ({
    page,
}) => {
    await prepare(page);
    await page.goto("/hackathon/2/challenges?track=industry&stage=initial");
    await expect(page.getByRole("heading", { name: "正式赛题测试", exact: true })).toBeVisible();
    await expect(page.locator('a[href="https://example.test/brief"]')).toBeVisible();
    await expect(page.locator('a[href="https://example.test/extra-submit"]')).toBeVisible();
    await expect(page.getByText("不能显示的未发布题目", { exact: true })).toHaveCount(0);
    await expect(page.locator('a[href="https://example.test/private-submit"]')).toHaveCount(0);
    await page.locator("#task-stage-semifinal").click();
    await expect(page.getByText("正式赛题测试", { exact: true })).toHaveCount(0);
    await expect(page.locator('a[href="https://example.test/extra-submit"]')).toHaveCount(0);
    await page.locator("#task-stage-initial").click();
    await page.locator("#task-track-campus").click();
    await expect(page.getByText("正式赛题测试", { exact: true })).toHaveCount(0);
    await expect(page.locator('a[href="https://example.test/extra-submit"]')).toHaveCount(0);
});

test("failed private submission read offers retry without showing a blank editable form", async ({
    page,
}) => {
    const state = await prepare(page, { failRead: true });
    await page.goto("/hackathon/2/challenges?track=campus&stage=initial");
    const retry = page.locator(".aix-task-access button");
    await expect(retry).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#material-campus-initial-githubUrl")).toHaveCount(0);
    const failedReads = state.reads;
    state.failRead = false;
    await retry.click();
    await expect(page.locator("#material-campus-initial-githubUrl")).toHaveValue(
        draftMaterials.githubUrl
    );
    await expect(retry).toHaveCount(0);
    expect(state.reads).toBe(failedReads + 1);
});

test("deadline preserves the formal receipt separately from later drafts and legacy links", async ({
    page,
}) => {
    await prepare(page, { date: "2026-10-18T17:00:00+08:00" });
    await page.goto("/hackathon/2/challenges?track=campus&stage=initial");
    await expect(page.locator("#material-campus-initial-githubUrl")).toBeDisabled();
    await expect(page.locator("#material-campus-initial-githubUrl")).toHaveValue(
        draftMaterials.githubUrl
    );
    await expect(page.locator(".aix-task-actions")).toHaveCount(0);
    const receipt = page.locator(".aix-task-receipt");
    await expect(receipt).toHaveAttribute("open", "");
    await expect(receipt).toContainText(formalMaterials.projectName);
    await expect(receipt.locator(`a[href="${formalMaterials.githubUrl}"]`)).toBeVisible();
    await expect(receipt.locator(`a[href="${draftMaterials.githubUrl}"]`)).toHaveCount(0);
    await expect(receipt.locator('a[href="https://github.com/test/legacy"]')).toHaveCount(0);
    await page.locator("#task-track-industry").click();
    await expect(page.locator("#material-industry-initial-githubUrl")).toBeDisabled();
    await expect(page.locator("#material-industry-initial-githubUrl")).toHaveValue(
        draftMaterials.githubUrl
    );
    await expect(page.locator(".aix-task-receipt")).toHaveCount(0);
    await expect(page.locator(".aix-task-actions")).toHaveCount(0);
});
