const AIX_EVENT_KEY = "zhekesong-ai-x-2026";

export function attachRegistrationSubmissions(registrations, roster) {
    const authors = new Map();
    for (const row of roster?.rows || []) {
        const key = `${row.registrationId}:${row.userId}`;
        const records = authors.get(key) || [];
        for (const record of Object.values(row.submissions || {})) {
            if (record) records.push(record);
        }
        authors.set(key, records);
    }
    return registrations.map((registration) => ({
        ...registration,
        submissionDataLoaded:
            registration.event_key === AIX_EVENT_KEY && Array.isArray(roster?.rows),
        submissionRecords:
            registration.event_key === AIX_EVENT_KEY
                ? authors.get(`${registration.id}:${registration.user_id}`) || []
                : [],
        submissionFiles: registration.event_key === AIX_EVENT_KEY ? roster?.files || [] : [],
    }));
}

export function registrationSubmissionState(registration) {
    if (!registration.submissionDataLoaded) return "unknown";
    if (registration.submissionRecords.some((record) => record.submittedAt)) return "submitted";
    return registration.submissionRecords.length ? "draft" : "none";
}

export function registrationSubmissionAnswers(registration) {
    if (registration.event_key !== AIX_EVENT_KEY) return {};
    const result = {
        workStatus: {
            unknown: "提交数据读取失败，请刷新",
            submitted: "已正式提交",
            draft: "仅草稿，未正式提交",
            none: "暂无本站作品提交",
        }[registrationSubmissionState(registration)],
    };
    for (const record of registration.submissionRecords || []) {
        // A later draft must never replace the formal materials used by reviewers.
        const snapshot = record.submitted || record.draft || {};
        const prefix = `work__${record.track}__${record.stage}__`;
        result[`${prefix}status`] = record.submittedAt ? "已正式提交" : "仅草稿，未正式提交";
        for (const key of ["projectName", "productHighlights", "githubUrl", "modelscopeUrl"])
            result[`${prefix}${key}`] = snapshot[key] || "";
        for (const key of ["bpFileId", "demoFileId"])
            result[`${prefix}${key}`] =
                (registration.submissionFiles || []).find(
                    (file) =>
                        String(file.id) === String(snapshot[key]) &&
                        file.track === record.track &&
                        file.stage === record.stage
                )?.name || "";
        result[`${prefix}submittedAt`] = record.submittedAt || "";
        result[`${prefix}draftUpdatedAt`] = record.draftUpdatedAt || "";
    }
    return result;
}

export function registrationSubmissionField(fieldId) {
    if (fieldId === "workStatus") return { id: fieldId, label: "作品提交情况" };
    const match = /^work__(industry|campus)__(initial|semifinal)__(.+)$/.exec(fieldId);
    if (!match) return null;
    const labels = {
        status: "作品提交状态",
        projectName: "项目名称",
        productHighlights: "作品特色",
        githubUrl: "GitHub 仓库",
        modelscopeUrl: match[1] === "industry" ? "魔搭社区部署链接或作品网址" : "作品或部署链接",
        bpFileId: "作品说明书文件",
        demoFileId: "Demo 文件",
        submittedAt: "作品正式提交时间",
        draftUpdatedAt: "作品草稿更新时间",
    };
    return {
        id: fieldId,
        label: `${match[1] === "industry" ? "华为" : "天猫校园"} · ${match[2] === "initial" ? "初赛" : "复赛"} · ${labels[match[3]] || match[3]}`,
    };
}
