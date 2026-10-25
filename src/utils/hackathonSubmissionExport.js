const csvCell = (value) => {
    const text = String(value ?? "");
    return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`;
};

export const submissionExportTable = (roster, label, formatDate) => {
    const files = new Map((roster.files || []).map((file) => [String(file.id), file]));
    const keys = [
        "projectName",
        "productHighlights",
        "githubUrl",
        "modelscopeUrl",
        "bpFileId",
        "demoFileId",
        "wechat",
        "visitNotes",
        "links",
        "attachmentReferences",
        "reviewNote",
    ];
    const snapshotValues = (snapshot) =>
        keys.flatMap((key) => {
            const value = snapshot?.[key] ?? "";
            if (key === "links")
                return [(snapshot?.links || []).map((link) => link.url).join("\n")];
            if (key === "attachmentReferences")
                return [(snapshot?.attachmentReferences || []).map((file) => file.name).join("\n")];
            if (!key.endsWith("FileId")) return [value];
            const file = files.get(String(value));
            return [
                file?.name || value,
                file ? new URL(file.downloadUrl, "https://tuotuzju.com").href : "",
            ];
        });
    const snapshotHeaders = (type) =>
        keys.flatMap((key) => [
            `${label(type)} · ${label(key)}`,
            ...(key.endsWith("FileId")
                ? [`${label(type)} · ${label(key)} · ${label("export_file_url")}`]
                : []),
        ]);
    const headers = [
        label("export_submission_id"),
        label("export_registration_id"),
        label("export_user_id"),
        label("track"),
        label("stage"),
        label("export_name"),
        label("export_student_id"),
        label("export_contact"),
        label("export_team"),
        label("export_team_size"),
        label("export_status"),
        label("submitted_at"),
        label("draft_at"),
        label("export_version"),
        label("export_qualified"),
        ...snapshotHeaders("submitted"),
        ...snapshotHeaders("draft"),
    ];
    const rows = (roster.rows || []).flatMap((row) =>
        Object.entries(row.submissions || {})
            .filter(([, submission]) => submission)
            .map(([stage, submission]) => [
                submission.id,
                row.registrationId,
                row.userId,
                label(row.track),
                label(stage),
                row.name,
                row.studentId,
                row.contact,
                row.teamName,
                row.teamSize,
                label(submission.submitted ? "export_submitted" : "export_draft"),
                /^\d{4}-\d{2}-\d{2}$/.test(submission.submittedAt || "")
                    ? submission.submittedAt
                    : formatDate(submission.submittedAt),
                formatDate(submission.draftUpdatedAt),
                submission.version,
                label(row.semifinalQualified ? "qualified" : "not_qualified"),
                ...snapshotValues(submission.submitted),
                ...snapshotValues(submission.draft),
            ])
    );
    return [headers, ...rows];
};

export const submissionExportCsv = (table) =>
    `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
