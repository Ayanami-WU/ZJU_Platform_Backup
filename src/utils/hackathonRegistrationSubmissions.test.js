import test from "node:test";
import assert from "node:assert/strict";
import {
    attachRegistrationSubmissions,
    registrationSubmissionState,
    registrationSubmissionAnswers,
    registrationSubmissionField,
} from "./hackathonRegistrationSubmissions.js";

const eventKey = "zhekesong-ai-x-2026";
const registration = (id, user_id, event_key = eventKey) => ({
    id,
    user_id,
    event_key,
    name: "同名选手",
});
const record = {
    id: 20,
    track: "industry",
    stage: "initial",
    submittedAt: "2026-10-18T08:00:00Z",
    submitted: { projectName: "正式版本", githubUrl: "https://example.org/review", bpFileId: 12 },
    draft: { projectName: "未提交的新草稿", githubUrl: "https://example.org/draft" },
    draftUpdatedAt: "2026-10-18T09:00:00Z",
};
const roster = {
    rows: [{ registrationId: 2, userId: 5, track: "industry", submissions: { initial: record } }],
    files: [{ id: 12, track: "industry", stage: "initial", name: "说明书.pdf" }],
};

test("submission data joins by both registration and account, never by author name or another event", () => {
    const rows = attachRegistrationSubmissions(
        [registration(1, 4), registration(2, 5), registration(2, 6), registration(2, 5, "history")],
        roster
    );
    assert.deepEqual(
        rows.map((row) => row.submissionRecords.length),
        [0, 1, 0, 0]
    );
    assert.equal(registrationSubmissionState(rows[0]), "none");
    assert.equal(registrationSubmissionState(rows[1]), "submitted");
    assert.deepEqual(registrationSubmissionAnswers(rows[3]), {});
});

test("export retains formal snapshot, distinguishes draft, and resolves the correct round's attachment", () => {
    const [row] = attachRegistrationSubmissions([registration(2, 5)], roster);
    const answers = registrationSubmissionAnswers(row);
    assert.equal(answers.work__industry__initial__projectName, "正式版本");
    assert.equal(answers.work__industry__initial__githubUrl, "https://example.org/review");
    assert.equal(answers.work__industry__initial__bpFileId, "说明书.pdf");
    assert.equal(answers.work__industry__initial__submittedAt, record.submittedAt);
    assert.match(
        registrationSubmissionField("work__industry__initial__projectName").label,
        /华为 · 初赛 · 项目名称/
    );
    const [draft] = attachRegistrationSubmissions([registration(2, 5)], {
        ...roster,
        rows: [
            {
                ...roster.rows[0],
                submissions: { initial: { ...record, submitted: null, submittedAt: null } },
            },
        ],
    });
    assert.equal(registrationSubmissionState(draft), "draft");
    assert.equal(
        registrationSubmissionAnswers(draft).work__industry__initial__projectName,
        "未提交的新草稿"
    );
});

test("failed or malformed submission reads remain unknown rather than falsely marking authors unsubmitted", () => {
    for (const unavailable of [null, {}, []]) {
        const [row] = attachRegistrationSubmissions([registration(2, 5)], unavailable);
        assert.equal(registrationSubmissionState(row), "unknown");
        assert.match(registrationSubmissionAnswers(row).workStatus, /读取失败/);
    }
    assert.doesNotThrow(() => registrationSubmissionAnswers(registration(2, 5)));
});
