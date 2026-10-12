import { test, expect } from "@playwright/test";
import fs from "node:fs";
const base = JSON.parse(
    fs.readFileSync(new URL("../shared/hackathonAiX.json", import.meta.url), "utf8")
);
const time = "2026-10-18T14:00:00+08:00";
const user = {
    id: 42,
    username: "submission-fixture",
    role: "user",
    registrationProfile: {
        name: "测试选手",
        studentId: "32600001",
        major: "计算机",
        grade: "sophomore",
    },
};
const empty = () => ({
    projectName: "",
    githubUrl: "",
    modelscopeUrl: "",
    bpFileId: "",
    demoFileId: "",
});
const stages = (qualified = false) => ({
    initial: {
        opensAt: "2026-10-13T00:00:00+08:00",
        closesAt: "2026-10-18T17:00:00+08:00",
        state: "open",
        canSave: true,
        canSubmit: true,
        blockedReason: null,
        requiredFields: ["projectName", "githubUrl", "modelscopeUrl"],
    },
    semifinal: {
        opensAt: "2026-10-19T00:00:00+08:00",
        closesAt: "2026-10-24T00:00:00+08:00",
        state: "upcoming",
        canSave: false,
        canSubmit: false,
        blockedReason: qualified ? "not_open" : "not_qualified",
        requiredFields: ["projectName", "githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"],
    },
    final: {
        opensAt: "2026-10-25T09:10:00+08:00",
        closesAt: "2026-10-25T11:30:00+08:00",
        state: "presentation",
        canSave: false,
        canSubmit: false,
        blockedReason: "presentation",
        requiredFields: [],
    },
});
async function fixture(page, { anonymous = false, language = "zh" } = {}) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const template = structuredClone(base);
    template.event.program.trackStages = {
        campus: Object.entries(stages()).map(([id, value]) => ({ id, ...value })),
        industry: Object.entries(stages()).map(([id, value]) => ({ id, ...value })),
    };
    template.event.program.challenges = [
        {
            id: "published",
            title: "已发布的实际任务",
            description: "围绕真实需求完成可运行的 AI 应用。",
            track: "campus",
            stage: "initial",
            published: true,
        },
        {
            id: "hidden",
            title: "不可泄露的未发布任务",
            description: "草稿",
            track: "campus",
            stage: "initial",
            published: false,
        },
    ];
    template.event.program.trackStages.industry.find(
        (value) => value.id === "semifinal"
    ).requiredFields = ["projectName", "githubUrl", "modelscopeUrl", "demoFileId"];
    const state = {
        fail: false,
        reads: 0,
        conflict: false,
        uploadFail: false,
        uploads: [],
        writes: [],
        data: {
            eventKey: base.event.key,
            serverNow: Date.parse(time),
            tracks: {
                campus: { registered: true, semifinalQualified: false, stages: stages() },
                industry: { registered: true, semifinalQualified: false, stages: stages() },
            },
            submissions: [],
            files: [],
            legacyRepositories: { githubUrl: "https://github.com/legacy/repo" },
        },
    };
    await page.clock.setFixedTime(new Date(time));
    await page.addInitScript(
        ({ anonymous, language }) => {
            localStorage.setItem("i18nextLng", language);
            if (!localStorage.getItem("ui_mode_v3")) localStorage.setItem("ui_mode_v3", "dark");
            if (!anonymous) localStorage.setItem("token", "submission-fixture");
        },
        { anonymous, language }
    );
    await page.route("**/api/**", async (route) => {
        const request = route.request(),
            path = new URL(request.url()).pathname;
        if (path === "/api/auth/me")
            return route.fulfill({ status: anonymous ? 401 : 200, json: anonymous ? {} : user });
        if (path === "/api/hackathon/schedule")
            return route.fulfill({ json: { events: [template], activeEventKey: base.event.key } });
        if (path === "/api/hackathon/submissions/files") {
            state.uploads.push(request.postData());
            if (state.uploadFail)
                return route.fulfill({ status: 503, json: { error: "fixture upload failure" } });
            const kind = request.postData().includes("\r\n\r\nbp\r\n") ? "bp" : "demo";
            const file = {
                id: state.data.files.length + 1,
                name: kind === "bp" ? "business-plan.pdf" : "demo.mp4",
                size: 1024,
                mimeType: kind === "bp" ? "application/pdf" : "video/mp4",
                downloadUrl: `/api/hackathon/submissions/files/${state.data.files.length + 1}`,
            };
            state.data.files.push(file);
            return route.fulfill({ json: { file } });
        }
        if (path.startsWith("/api/hackathon/submissions/files/")) {
            expect(request.headers().authorization).toBe("Bearer submission-fixture");
            return route.fulfill({ contentType: "application/octet-stream", body: "fixture file" });
        }
        if (path === "/api/hackathon/submissions") {
            if (request.method() === "GET") {
                state.reads++;
                return route.fulfill({ json: state.data });
            }
            const payload = request.postDataJSON();
            state.writes.push(payload);
            if (state.fail)
                return route.fulfill({ status: 503, json: { error: "fixture failure" } });
            const old = state.data.submissions.find(
                (row) => row.track === payload.track && row.stage === payload.stage
            );
            if (state.conflict || payload.expectedVersion !== (old?.version || 0))
                return route.fulfill({
                    status: 409,
                    json: { code: "HACKATHON_SUBMISSION_CONFLICT" },
                });
            const submission = {
                id: old?.id || state.data.submissions.length + 1,
                track: payload.track,
                stage: payload.stage,
                version: (old?.version || 0) + 1,
                draft: { ...empty(), ...payload.materials },
                draftUpdatedAt: time,
                submitted:
                    payload.action === "submit" ? { ...payload.materials } : old?.submitted || null,
                submittedAt: payload.action === "submit" ? time : old?.submittedAt || null,
            };
            state.data.submissions = [
                ...state.data.submissions.filter(
                    (row) => row.track !== payload.track || row.stage !== payload.stage
                ),
                submission,
            ];
            return route.fulfill({ json: { submission, serverNow: time } });
        }
        if (path === "/api/hackathon/registration")
            return route.fulfill({ json: { registration: null } });
        return route.fulfill({ json: {} });
    });
    return state;
}

test("round submissions preserve draft isolation, failures, formal snapshots and conflict choices", async ({
    page,
}) => {
    const state = await fixture(page);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/hackathon/2/challenges?track=campus&stage=initial");
    const form = page.locator(".aix-task-submission");
    await expect(page.getByText("已发布的实际任务", { exact: true })).toBeVisible();
    await expect(page.getByText("不可泄露的未发布任务")).toHaveCount(0);
    await expect(form.getByLabel(/GitHub 仓库链接/)).toBeEnabled();
    await expect(form.getByLabel(/项目名称/)).toHaveCount(1);
    await form.getByLabel(/项目名称/).fill("   ");
    await form.getByRole("button", { name: "正式提交", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("请填写项目名称");
    expect(state.writes).toHaveLength(0);
    await form.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(form.getByText("草稿已保存，尚未更新正式提交。", { exact: true })).toBeVisible();
    expect(state.data.submissions[0].draft.projectName).toBe("");
    await form.getByLabel(/项目名称/).fill("天猫初赛草稿");
    await form.getByLabel(/GitHub 仓库链接/).fill("https://github.com/team/campus");
    await form.getByLabel(/魔搭部署链接/).fill("https://modelscope.cn/studios/team/campus");
    await page.getByRole("tab", { name: /华为/ }).click();
    await expect(form.getByLabel(/项目名称/)).toHaveValue("");
    await form.getByLabel(/项目名称/).fill("华为独立草稿");
    await page.getByRole("tab", { name: /天猫/ }).click();
    await expect(form.getByLabel(/项目名称/)).toHaveValue("天猫初赛草稿");
    state.fail = true;
    await form.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText("输入已保留");
    await expect(form.getByLabel(/GitHub 仓库链接/)).toHaveValue("https://github.com/team/campus");
    state.fail = false;
    await form.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(form.getByText("草稿已保存，尚未更新正式提交。", { exact: true })).toBeVisible();
    expect(state.data.submissions[0].submitted).toBeNull();
    await form.getByRole("button", { name: "正式提交", exact: true }).click();
    await expect(form.getByText("正式提交已保存。", { exact: true })).toBeVisible();
    await form.getByLabel(/项目名称/).fill("尚未更新正式版");
    await form.getByRole("button", { name: "保存草稿", exact: true }).click();
    expect(state.data.submissions[0].submitted.projectName).toBe("天猫初赛草稿");
    await expect(form.getByText("草稿与正式提交不同", { exact: true })).toBeVisible();
    state.data.submissions[0].version++;
    state.data.submissions[0].draft.projectName = "另一窗口的版本";
    await form.getByLabel(/项目名称/).fill("本地保留版本");
    await form.getByRole("button", { name: "更新正式提交", exact: true }).click();
    await expect(form.getByRole("button", { name: "载入已保存内容" })).toBeVisible();
    await expect(form.getByLabel(/项目名称/)).toHaveValue("本地保留版本");
    await form.getByRole("button", { name: "保留当前输入继续编辑" }).click();
    await form.getByRole("button", { name: "更新正式提交", exact: true }).click();
    await expect(form.getByText("正式提交已保存。", { exact: true })).toBeVisible();
    expect(state.data.submissions[0].submitted.projectName).toBe("本地保留版本");
    await page.screenshot({ path: "output/playwright/aix-task-desktop.png", fullPage: true });
    await page.getByRole("tab", { name: /复赛/ }).click();
    await expect(page.getByText("尚未获得本赛道复赛资格", { exact: true })).toBeVisible();
    await expect(form.getByLabel(/商业计划书/)).toBeDisabled();
    await page.getByRole("tab", { name: /决赛/ }).click();
    await expect(page.locator(".aix-task-final")).toContainText("09:10—11:30");
    await expect(page.locator(".aix-task-submission")).toHaveCount(0);
    await page.getByRole("tab", { name: /初赛/ }).click();
    state.data.serverNow = "2026-10-18T18:00:00+08:00";
    Object.values(state.data.tracks).forEach((track) =>
        Object.assign(track.stages.initial, {
            state: "closed",
            canSave: false,
            canSubmit: false,
            blockedReason: "closed",
        })
    );
    await page.reload();
    await expect(form.getByText("正式提交回执", { exact: false })).toBeVisible();
    await expect(form.getByLabel(/GitHub 仓库链接/)).toBeDisabled();
    await expect(form.getByRole("button", { name: "更新正式提交", exact: true })).toHaveCount(0);
    expect(
        state.writes.every((value) => value.track === "campus" && value.stage === "initial")
    ).toBe(true);
});

test("anonymous mobile preview keeps tabs enabled, fields locked and final free of invented uploads", async ({
    page,
}) => {
    const state = await fixture(page, { anonymous: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/hackathon/2/challenges?track=campus&stage=initial");
    await expect(page.locator(".aix-task-submission .aix-registration-lock")).toBeVisible();
    await expect(page.getByLabel(/GitHub 仓库链接/)).toBeDisabled();
    await page.getByRole("tab", { name: /复赛/ }).click();
    await expect(page.getByLabel(/商业计划书/)).toBeDisabled();
    await page.getByRole("tab", { name: /华为/ }).click();
    await expect(page.getByLabel(/商业计划书/)).toHaveCount(0);
    await page.screenshot({ path: "output/playwright/aix-task-mobile.png", fullPage: true });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    await page.evaluate(() => localStorage.setItem("ui_mode_v3", "day"));
    await page.reload();
    await expect(page.locator(".aix-task-submission")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    await page.screenshot({ path: "output/playwright/aix-task-mobile-day.png", fullPage: true });
    expect(state.writes).toHaveLength(0);
});

test("qualified semifinal accepts private file uploads, preserves previous files on failure and downloads with auth", async ({
    page,
}) => {
    const state = await fixture(page);
    state.data.serverNow = Date.parse("2026-10-20T14:00:00+08:00");
    Object.values(state.data.tracks).forEach((track) =>
        Object.assign(track.stages.semifinal, {
            state: "open",
            canSave: true,
            canSubmit: true,
            blockedReason: null,
        })
    );
    await page.goto("/hackathon/2/challenges?track=campus&stage=semifinal");
    const form = page.locator(".aix-task-submission");
    await expect(form.getByLabel(/GitHub 仓库链接/)).toBeEnabled();
    await form.getByLabel(/项目名称/).fill("复赛项目");
    await form.getByLabel(/GitHub 仓库链接/).fill("https://github.com/team/project");
    await form.getByLabel(/魔搭部署链接/).fill("https://team-project.ms.show");
    const bp = form.locator('input[name="bpFileId"]');
    const demo = form.locator('input[name="demoFileId"]');
    await bp.setInputFiles({
        name: "business-plan.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.7 test fixture"),
    });
    await expect(
        form.locator(".aix-task-file-attached").filter({ hasText: "business-plan.pdf" })
    ).toBeVisible();
    await demo.setInputFiles({
        name: "demo.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("mock video fixture"),
    });
    await expect(
        form.locator(".aix-task-file-attached").filter({ hasText: "demo.mp4" })
    ).toBeVisible();
    state.uploadFail = true;
    await bp.setInputFiles({
        name: "replacement.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF replacement"),
    });
    await expect(form.getByRole("alert")).toContainText("原文件和输入已保留");
    await expect(
        form.locator(".aix-task-file-attached").filter({ hasText: "business-plan.pdf" })
    ).toBeVisible();
    await form.getByRole("button", { name: "正式提交", exact: true }).click();
    await expect(form.getByText("正式提交已保存。", { exact: true })).toBeVisible();
    expect(state.data.submissions[0].submitted.bpFileId).toBe(1);
    expect(state.data.submissions[0].submitted.demoFileId).toBe(2);
    const download = page.waitForEvent("download");
    await form.getByRole("button", { name: "下载商业计划书（BP）", exact: true }).click();
    expect((await download).suggestedFilename()).toBe("business-plan.pdf");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.reload();
    await expect(
        form.getByRole("button", { name: "下载商业计划书（BP）", exact: true })
    ).toBeVisible();
    await page.screenshot({ path: "output/playwright/aix-task-files-desktop.png", fullPage: true });
});

test("crossing a round opening refreshes eligibility once without losing other-round input", async ({
    page,
}) => {
    const state = await fixture(page);
    await page.clock.install({ time: new Date(time) });
    Object.assign(state.data.tracks.campus.stages.semifinal, {
        opensAt: "2026-10-18T14:00:30+08:00",
        blockedReason: "not_open",
    });
    await page.goto("/hackathon/2/challenges?track=campus&stage=initial");
    const form = page.locator(".aix-task-submission");
    await expect(form.getByLabel(/项目名称/)).toBeEnabled();
    await form.getByLabel(/项目名称/).fill("切轮次保留的初赛草稿");
    await page.getByRole("tab", { name: /复赛/ }).click();
    await expect(form.getByLabel(/项目名称/)).toBeDisabled();
    Object.assign(state.data.tracks.campus.stages.semifinal, {
        state: "open",
        canSave: true,
        canSubmit: true,
        blockedReason: null,
    });
    state.data.serverNow = Date.parse("2026-10-18T14:00:31+08:00");
    await page.clock.fastForward(31000);
    await expect(form.getByLabel(/项目名称/)).toBeEnabled();
    expect(state.reads).toBe(2);
    await page.getByRole("tab", { name: /初赛/ }).click();
    await expect(form.getByLabel(/项目名称/)).toHaveValue("切轮次保留的初赛草稿");
    await page.clock.fastForward(31000);
    expect(state.reads).toBe(2);
});
