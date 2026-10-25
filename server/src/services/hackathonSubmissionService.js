const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const defaults = require("../../../shared/hackathonAiX.json");
const { getHackathonTemplate } = require("./hackathonTemplateService");
const { activeTrackRegistrations } = require("./hackathonTrackRegistrationService");
const { reviewQualificationMembers } = require("./hackathonQualificationService");
const {
    AIX_EVENT_KEY,
    repositorySubmission,
    normalizeRepositoryUrl,
} = require("./hackathonRepositoryService");
const TRACKS = ["campus", "industry"];
const STAGES = ["initial", "semifinal", "final"];
const fail = (status, code, error, extra = {}) => {
    throw Object.assign(new Error(error), { status, code, ...extra });
};
const checkEvent = (eventKey) => {
    if (eventKey !== AIX_EVENT_KEY)
        fail(400, "HACKATHON_SUBMISSION_EVENT", "该赛事不支持分轮次提交");
};
const checkTrack = (track) => {
    if (!TRACKS.includes(track))
        fail(400, "HACKATHON_SUBMISSION_INVALID", "请选择有效赛道", { field: "track" });
};
const getTrackStages = (template, track) => {
    const program = template.event.program || {};
    const explicit = program.trackStages?.[track];
    return (explicit || program.stages || defaults.event.program.stages).map((stage) => ({
        ...stage,
        ...(!explicit && track === "campus" && stage.id === "initial"
            ? { opensAt: "2026-10-13T00:00:00+08:00" }
            : {}),
    }));
};
const entriesFor = (row) =>
    row ? activeTrackRegistrations(JSON.parse(row.form_data_json || "{}"), row.created_at) : {};
const stageInfo = (template, track, stage, registered, qualified, now) => {
    const window = getTrackStages(template, track).find((item) => item.id === stage);
    const opensAt = window?.opensAt || null;
    const closesAt = window?.closesAt || null;
    const valid =
        Number.isFinite(Date.parse(opensAt)) &&
        Number.isFinite(Date.parse(closesAt)) &&
        Date.parse(opensAt) < Date.parse(closesAt);
    const state =
        stage === "final"
            ? "presentation"
            : !valid || now >= Date.parse(closesAt)
              ? "closed"
              : now < Date.parse(opensAt)
                ? "upcoming"
                : "open";
    const blockedReason = !registered
        ? "not_registered"
        : stage === "final"
          ? "presentation"
          : stage === "semifinal" && !qualified
            ? "not_qualified"
            : state === "upcoming"
              ? "not_open"
              : state === "closed"
                ? "closed"
                : null;
    return {
        opensAt,
        closesAt,
        state,
        canSave: !blockedReason,
        canSubmit: !blockedReason,
        blockedReason,
        requiredFields:
            window?.requiredFields ||
            (stage === "final"
                ? []
                : stage === "initial"
                  ? [
                        "projectName",
                        "githubUrl",
                        "modelscopeUrl",
                        ...(track === "industry" ? ["bpFileId"] : []),
                    ]
                  : track === "campus"
                    ? ["projectName", "githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"]
                    : [
                          "projectName",
                          "githubUrl",
                          "modelscopeUrl",
                          ...(track === "industry" ? ["bpFileId"] : []),
                          "demoFileId",
                      ]),
    };
};
const normalizeMaterials = (input, required = [], track = "campus") => {
    const allowAnyProjectUrl = track === "industry";
    if (!input || typeof input !== "object" || Array.isArray(input))
        fail(400, "HACKATHON_SUBMISSION_INVALID", "请填写提交材料", { field: "materials" });
    const data = {};
    for (const field of [
        "projectName",
        "productHighlights",
        "githubUrl",
        "modelscopeUrl",
        "bpFileId",
        "demoFileId",
    ]) {
        if (field === "bpFileId" || field === "demoFileId") {
            const id = input[field];
            data[field] = id === null || id === undefined || id === "" ? null : id;
            if (data[field] !== null && (!Number.isSafeInteger(id) || id <= 0))
                fail(400, "HACKATHON_SUBMISSION_INVALID", "请选择有效的附件", { field });
            if (required.includes(field) && !data[field])
                fail(400, "HACKATHON_SUBMISSION_INVALID", "请上传必填材料", { field });
            continue;
        }
        const raw = input[field] ?? "";
        if (
            typeof raw !== "string" ||
            raw.length >
                (field === "projectName" ? 160 : field === "productHighlights" ? 1000 : 2000)
        )
            fail(400, "HACKATHON_SUBMISSION_INVALID", "材料格式或长度无效", { field });
        data[field] = raw.trim();
        if (required.includes(field) && !data[field])
            fail(400, "HACKATHON_SUBMISSION_INVALID", "请补全必填材料", { field });
        if (!["projectName", "productHighlights"].includes(field) && data[field]) {
            try {
                if (
                    field === "modelscopeUrl" &&
                    (!/^[a-z][a-z0-9+.-]*:/i.test(data[field]) ||
                        (allowAnyProjectUrl && /^[^/?#:\s]+:\d+(?:[/?#]|$)/.test(data[field])))
                )
                    data[field] = `https://${data[field]}`;
                const url = new URL(data[field]);
                if (
                    !(
                        field === "modelscopeUrl" && allowAnyProjectUrl
                            ? ["http:", "https:"]
                            : ["https:"]
                    ).includes(url.protocol) ||
                    !url.hostname ||
                    url.username ||
                    url.password ||
                    /[\u0000-\u0020\u007f]/.test(data[field])
                )
                    throw new Error();
                if (field === "githubUrl") {
                    data[field] = normalizeRepositoryUrl(data[field], "github");
                } else if (field === "modelscopeUrl" && !allowAnyProjectUrl) {
                    const host = url.hostname.toLowerCase();
                    if (url.port) throw new Error();
                    if (
                        [
                            "modelscope.cn",
                            "www.modelscope.cn",
                            "modelscope.ai",
                            "www.modelscope.ai",
                        ].includes(host)
                    ) {
                        if (!url.pathname.startsWith("/studios/")) throw new Error();
                        data[field] = normalizeRepositoryUrl(data[field], "modelscope");
                    } else if (host.endsWith(".ms.show") && host !== "ms.show") {
                        data[field] = url.href;
                    } else throw new Error();
                } else data[field] = url.href;
            } catch {
                fail(
                    400,
                    "HACKATHON_SUBMISSION_INVALID",
                    field === "githubUrl"
                        ? "请填写有效的 GitHub HTTPS 仓库链接"
                        : field === "modelscopeUrl"
                          ? allowAnyProjectUrl
                              ? "请填写有效的作品网址"
                              : "请填写 HTTPS 魔搭创空间或 ms.show 部署链接"
                          : "请填写有效的 HTTPS 材料链接",
                    { field }
                );
            }
        }
    }
    return data;
};
const filePayload = (row) => ({
    id: row.id,
    name: row.original_name,
    size: row.size,
    mimeType: row.mime_type,
    downloadUrl: `/api/hackathon/submissions/files/${row.id}`,
    track: row.track,
    stage: row.stage,
    kind: row.kind,
});
const submissionPayload = (row) =>
    row
        ? {
              id: row.id,
              track: row.track,
              stage: row.stage,
              version: row.version,
              draft: row.draft_json && row.draft_json !== "{}" ? JSON.parse(row.draft_json) : null,
              draftUpdatedAt:
                  row.draft_json && row.draft_json !== "{}" ? row.draft_updated_at : null,
              submitted: row.submitted_json ? JSON.parse(row.submitted_json) : null,
              submittedAt: row.submitted_at || null,
          }
        : null;
function createHackathonSubmissionService({
    filename = process.env.DATABASE_FILE || path.join(__dirname, "../../database.sqlite"),
    now = Date.now,
} = {}) {
    const connect = async () => {
        const db = await open({ filename, driver: sqlite3.Database });
        await db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000");
        return db;
    };
    const useDb = async (write, fn) => {
        const db = await connect();
        try {
            await db.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
            const value = await fn(db);
            await db.exec("COMMIT");
            return value;
        } catch (error) {
            await db.exec("ROLLBACK").catch(() => {});
            throw error;
        } finally {
            await db.close();
        }
    };
    const templateFor = async (db) => {
        const template = await getHackathonTemplate(db, AIX_EVENT_KEY);
        if (template.event.key !== AIX_EVENT_KEY)
            fail(404, "HACKATHON_SUBMISSION_EVENT", "赛事不存在");
        return template;
    };
    const registrationFor = (db, userId) =>
        db.get("SELECT * FROM hackathon_registrations WHERE event_key=? AND user_id=?", [
            AIX_EVENT_KEY,
            userId,
        ]);
    const eligibility = async (db, row, template, time) => {
        const registered = entriesFor(row);
        const qualifications = row
            ? await db.all(
                  "SELECT * FROM hackathon_submission_qualifications WHERE registration_id=?",
                  [row.id]
              )
            : [];
        return Object.fromEntries(
            TRACKS.map((track) => {
                const qualification = qualifications.find(
                    (item) => item.track === track && item.qualified === 1
                );
                const qualified = Boolean(qualification);
                return [
                    track,
                    {
                        registered: Boolean(registered[track]),
                        semifinalQualified: qualified,
                        qualificationUpdatedAt: qualification?.updated_at || null,
                        teamName: registered[track]?.answers?.team || "",
                        stages: Object.fromEntries(
                            STAGES.map((stage) => [
                                stage,
                                stageInfo(
                                    template,
                                    track,
                                    stage,
                                    Boolean(registered[track]),
                                    qualified,
                                    time
                                ),
                            ])
                        ),
                    },
                ];
            })
        );
    };
    return {
        getMine: (userId, eventKey) => {
            checkEvent(eventKey);
            return useDb(false, async (db) => {
                const row = await registrationFor(db, userId);
                const template = await templateFor(db);
                const serverNow = now();
                return {
                    eventKey,
                    serverNow,
                    tracks: await eligibility(db, row, template, serverNow),
                    submissions: (
                        await db.all(
                            "SELECT * FROM hackathon_submissions WHERE event_key=? AND user_id=? AND record_key='primary' ORDER BY track,stage",
                            [eventKey, userId]
                        )
                    ).map(submissionPayload),
                    files: (
                        await db.all(
                            "SELECT * FROM hackathon_submission_files WHERE event_key=? AND user_id=?",
                            [eventKey, userId]
                        )
                    ).map(filePayload),
                    legacyRepositories: repositorySubmission(row),
                };
            });
        },
        save: (userId, body) => {
            checkEvent(body.eventKey);
            checkTrack(body.track);
            if (
                !["initial", "semifinal"].includes(body.stage) ||
                !["save", "submit", "withdraw"].includes(body.action) ||
                !Number.isSafeInteger(body.expectedVersion) ||
                body.expectedVersion < 0
            )
                fail(400, "HACKATHON_SUBMISSION_INVALID", "提交阶段、操作或版本无效");
            return useDb(true, async (db) => {
                const row = await registrationFor(db, userId);
                const template = await templateFor(db);
                const serverNow = now();
                const info = (await eligibility(db, row, template, serverNow))[body.track].stages[
                    body.stage
                ];
                if (!info.canSave)
                    fail(403, "HACKATHON_SUBMISSION_BLOCKED", "当前无法修改本轮材料", {
                        reason: info.blockedReason,
                    });
                if (body.action === "withdraw") {
                    const existing = await db.get(
                        "SELECT * FROM hackathon_submissions WHERE event_key=? AND user_id=? AND track=? AND stage=? AND record_key='primary'",
                        [body.eventKey, userId, body.track, body.stage]
                    );
                    if (!existing || existing.version !== body.expectedVersion)
                        fail(409, "HACKATHON_SUBMISSION_CONFLICT", "材料已更新，请刷新后重试");
                    await db.run(
                        "UPDATE hackathon_submissions SET submitted_json=NULL,submitted_at=NULL,version=version+1 WHERE id=? AND user_id=?",
                        [existing.id, userId]
                    );
                    const saved = await db.get("SELECT * FROM hackathon_submissions WHERE id=?", [
                        existing.id,
                    ]);
                    return { submission: submissionPayload(saved), serverNow };
                }
                const materials = normalizeMaterials(
                    body.materials,
                    body.action === "submit" ? info.requiredFields : [],
                    body.track
                );
                for (const kind of ["bp", "demo"]) {
                    const field = `${kind}FileId`;
                    if (!materials[field]) continue;
                    const file = await db.get(
                        "SELECT id FROM hackathon_submission_files WHERE id=? AND event_key=? AND user_id=? AND track=? AND stage=? AND kind=?",
                        [materials[field], body.eventKey, userId, body.track, body.stage, kind]
                    );
                    const allowed =
                        kind === "bp"
                            ? ["initial", "semifinal"].includes(body.stage)
                            : body.track === "industry"
                              ? body.stage === "semifinal"
                              : body.track === "campus" &&
                                ["initial", "semifinal"].includes(body.stage);
                    if (!file || !allowed)
                        fail(400, "HACKATHON_SUBMISSION_INVALID", "附件不属于当前赛道与轮次", {
                            field,
                        });
                }
                const existing = await db.get(
                    "SELECT * FROM hackathon_submissions WHERE event_key=? AND user_id=? AND track=? AND stage=? AND record_key='primary'",
                    [body.eventKey, userId, body.track, body.stage]
                );
                if ((existing?.version || 0) !== body.expectedVersion)
                    fail(
                        409,
                        "HACKATHON_SUBMISSION_CONFLICT",
                        "材料已在其他页面更新，请刷新后重试"
                    );
                const stamp = new Date(serverNow).toISOString();
                const json = JSON.stringify(materials);
                const formal = body.action === "submit";
                if (existing) {
                    await db.run(
                        "UPDATE hackathon_submissions SET draft_json=?,draft_updated_at=?,submitted_json=?,submitted_at=?,version=version+1 WHERE id=? AND user_id=?",
                        [
                            json,
                            stamp,
                            formal ? json : existing.submitted_json,
                            formal ? stamp : existing.submitted_at,
                            existing.id,
                            userId,
                        ]
                    );
                } else {
                    await db.run(
                        "INSERT INTO hackathon_submissions (event_key,user_id,registration_id,track,stage,version,draft_json,draft_updated_at,submitted_json,submitted_at) VALUES (?,?,?,?,?,1,?,?,?,?)",
                        [
                            body.eventKey,
                            userId,
                            row.id,
                            body.track,
                            body.stage,
                            json,
                            stamp,
                            formal ? json : null,
                            formal ? stamp : null,
                        ]
                    );
                }
                const saved = await db.get(
                    "SELECT * FROM hackathon_submissions WHERE event_key=? AND user_id=? AND track=? AND stage=? AND record_key='primary'",
                    [body.eventKey, userId, body.track, body.stage]
                );
                return { submission: submissionPayload(saved), serverNow };
            });
        },
        addFile: (userId, body, file) => {
            checkEvent(body.eventKey);
            checkTrack(body.track);
            const allowed =
                body.kind === "bp"
                    ? ["initial", "semifinal"].includes(body.stage)
                    : body.kind === "demo" &&
                      ((body.track === "industry" && body.stage === "semifinal") ||
                          (body.track === "campus" &&
                              ["initial", "semifinal"].includes(body.stage)));
            if (!allowed) fail(400, "HACKATHON_SUBMISSION_INVALID", "附件类型或提交阶段无效");
            return useDb(true, async (db) => {
                const row = await registrationFor(db, userId);
                const template = await templateFor(db);
                const info = (await eligibility(db, row, template, now()))[body.track].stages[
                    body.stage
                ];
                if (!info.canSave)
                    fail(403, "HACKATHON_SUBMISSION_BLOCKED", "当前无法上传本轮材料", {
                        reason: info.blockedReason,
                    });
                const saved = await db.run(
                    "INSERT INTO hackathon_submission_files(event_key,user_id,registration_id,track,stage,kind,storage_name,original_name,size,mime_type,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                    [
                        body.eventKey,
                        userId,
                        row.id,
                        body.track,
                        body.stage,
                        body.kind,
                        file.storageName,
                        file.name,
                        file.size,
                        file.mimeType,
                        new Date(now()).toISOString(),
                    ]
                );
                return {
                    file: filePayload(
                        await db.get("SELECT * FROM hackathon_submission_files WHERE id=?", [
                            saved.lastID,
                        ])
                    ),
                };
            });
        },
        getFile: (userId, id, admin = false) =>
            useDb(false, async (db) => {
                if (!Number.isSafeInteger(id) || id <= 0)
                    fail(404, "HACKATHON_FILE_NOT_FOUND", "附件不存在");
                const row = await db.get(
                    "SELECT * FROM hackathon_submission_files WHERE id=? AND (?=1 OR user_id=?)",
                    [id, Number(admin), userId]
                );
                if (!row) fail(404, "HACKATHON_FILE_NOT_FOUND", "附件不存在");
                return row;
            }),
        setQualification: (adminId, body) => {
            checkEvent(body.eventKey);
            checkTrack(body.track);
            if (
                !Number.isSafeInteger(body.userId) ||
                body.userId <= 0 ||
                typeof body.qualified !== "boolean"
            )
                fail(400, "HACKATHON_SUBMISSION_INVALID", "晋级设置无效");
            return useDb(true, async (db) => {
                const row = await registrationFor(db, body.userId);
                if (!entriesFor(row)[body.track])
                    fail(404, "HACKATHON_REGISTRATION_REQUIRED", "该用户未报名该赛道");
                const stamp = new Date(now()).toISOString();
                await db.run(
                    `INSERT INTO hackathon_submission_qualifications (event_key,user_id,registration_id,track,qualified,updated_at,updated_by) VALUES (?,?,?,?,?,?,?) ON CONFLICT(event_key,user_id,track) DO UPDATE SET qualified=excluded.qualified,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
                    [
                        body.eventKey,
                        body.userId,
                        row.id,
                        body.track,
                        Number(body.qualified),
                        stamp,
                        adminId,
                    ]
                );
                return {
                    userId: body.userId,
                    track: body.track,
                    semifinalQualified: body.qualified,
                    qualificationUpdatedAt: stamp,
                };
            });
        },
        batchQualify: (adminId, body) => {
            checkEvent(body.eventKey);
            if (typeof body.apply !== "boolean")
                fail(400, "HACKATHON_QUALIFICATION_REVIEW", "请先预览晋级名单");
            return useDb(body.apply, async (db) => {
                const review = await reviewQualificationMembers(db, body.eventKey, body.members);
                if (!body.apply) return { ...review, applied: false };
                if (body.expectedFingerprint !== review.fingerprint)
                    fail(409, "HACKATHON_QUALIFICATION_REVIEW", "报名或晋级信息已变化，请重新预览");
                const stamp = new Date(now()).toISOString();
                for (const row of review.rows) {
                    if (row.qualified) continue;
                    await db.run(
                        `INSERT INTO hackathon_submission_qualifications (event_key,user_id,registration_id,track,qualified,updated_at,updated_by) VALUES (?,?,?,'industry',1,?,?) ON CONFLICT(event_key,user_id,track) DO UPDATE SET registration_id=excluded.registration_id,qualified=1,updated_at=excluded.updated_at,updated_by=excluded.updated_by`,
                        [body.eventKey, row.userId, row.registrationId, stamp, adminId]
                    );
                }
                return {
                    ...review,
                    applied: true,
                    granted: review.rows.filter((row) => !row.qualified).length,
                };
            });
        },
        getRoster: (eventKey) => {
            checkEvent(eventKey);
            return useDb(false, async (db) => {
                const registrations = await db.all(
                    "SELECT * FROM hackathon_registrations WHERE event_key=? ORDER BY id",
                    [eventKey]
                );
                const submissions = await db.all(
                    "SELECT * FROM hackathon_submissions WHERE event_key=?",
                    [eventKey]
                );
                const qualifications = await db.all(
                    "SELECT * FROM hackathon_submission_qualifications WHERE event_key=?",
                    [eventKey]
                );
                return {
                    eventKey,
                    serverNow: now(),
                    files: (
                        await db.all("SELECT * FROM hackathon_submission_files WHERE event_key=?", [
                            eventKey,
                        ])
                    ).map(filePayload),
                    rows: registrations.flatMap((row) => {
                        const entries = entriesFor(row);
                        const own = submissions.filter((item) => item.registration_id === row.id);
                        const tracks = new Set([
                            ...Object.keys(entries),
                            ...own
                                .filter((item) => item.record_key !== "primary")
                                .map((item) => item.track),
                        ]);
                        return [...tracks].flatMap((track) => {
                            const answers = entries[track]?.answers || {};
                            const qualification = qualifications.find(
                                (item) => item.registration_id === row.id && item.track === track
                            );
                            const base = {
                                registrationId: row.id,
                                userId: row.user_id,
                                track,
                                name: answers.name || row.name || "",
                                studentId: answers.studentId || row.student_id || "",
                                contact: answers.contact || "",
                                teamName: answers.team || "",
                                teamSize: Number(answers.teamSize) || null,
                                canManageQualification: Boolean(row.user_id && entries[track]),
                                semifinalQualified: qualification?.qualified === 1,
                                qualificationUpdatedAt: qualification?.updated_at || null,
                            };
                            const records = own.filter((item) => item.track === track);
                            const primary = entries[track]
                                ? records.filter((item) => item.record_key === "primary")
                                : [];
                            const additional = records.filter(
                                (item) => item.record_key !== "primary"
                            );
                            const result = [];
                            if (primary.length || !additional.length)
                                result.push({
                                    ...base,
                                    rowKey: `${row.id}:${track}:primary`,
                                    submissions: Object.fromEntries(
                                        ["initial", "semifinal"].map((stage) => [
                                            stage,
                                            submissionPayload(
                                                primary.find((item) => item.stage === stage)
                                            ),
                                        ])
                                    ),
                                });
                            for (const record of additional) {
                                const payload = submissionPayload(record);
                                const snapshot = payload.submitted || payload.draft;
                                result.push({
                                    ...base,
                                    rowKey: `${row.id}:${track}:${record.id}`,
                                    availableStages: [record.stage],
                                    name: snapshot.captainName || base.name,
                                    contact: snapshot.contact || base.contact,
                                    teamName: snapshot.teamName || base.teamName,
                                    teamSize: snapshot.teamSize ?? base.teamSize,
                                    submissions: { [record.stage]: payload },
                                });
                            }
                            return result;
                        });
                    }),
                };
            });
        },
    };
}
module.exports = {
    createHackathonSubmissionService,
    getTrackStages,
    normalizeMaterials,
    stageInfo,
};
