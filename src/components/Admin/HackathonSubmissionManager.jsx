import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import api from "../../services/api";
import { safeWebUrl } from "../../utils/hackathonAiX";
import HackathonQualificationImport from "./HackathonQualificationImport";
import { submissionExportTable, submissionExportCsv } from "../../utils/hackathonSubmissionExport";
import {
    AdminButton,
    AdminLoadingState,
    AdminPanel,
    ConfirmDialog,
    FilterChip,
    useAdminTheme,
} from "./AdminUI";

import SubmissionAdditionalMaterials from "./SubmissionAdditionalMaterials";

const materialKeys = ["githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"];

export default function HackathonSubmissionManager({ eventKey }) {
    const { t, i18n } = useTranslation();
    const text = (key, options) => t(`admin.hackathon_submissions.${key}`, options);
    const { mutedTextClass, headingTextClass } = useAdminTheme();
    const [rows, setRows] = useState([]);
    const [files, setFiles] = useState([]);
    const [downloadingId, setDownloadingId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [track, setTrack] = useState("industry");
    const [stage, setStage] = useState("initial");
    const [query, setQuery] = useState("");
    const [pendingRow, setPendingRow] = useState(null);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);
    const requestId = useRef(0);

    const refresh = useCallback(async () => {
        const id = ++requestId.current;
        setLoading(true);
        setError("");
        try {
            const response = await api.get("/admin/hackathon/submissions", {
                params: { event: eventKey },
            });
            if (id === requestId.current) {
                setRows(Array.isArray(response.data.rows) ? response.data.rows : []);
                setFiles(Array.isArray(response.data.files) ? response.data.files : []);
            }
        } catch (err) {
            if (id === requestId.current)
                setError(err.response?.data?.error || t("admin.hackathon_submissions.load_failed"));
        } finally {
            if (id === requestId.current) setLoading(false);
        }
    }, [eventKey, t]);

    useEffect(() => {
        setRows([]);
        setFiles([]);
        setPendingRow(null);
        refresh();
        return () => {
            requestId.current += 1;
        };
    }, [refresh]);

    const filtered = useMemo(
        () =>
            rows.filter(
                (row) =>
                    row.track === track &&
                    (!row.availableStages || row.availableStages.includes(stage)) &&
                    [
                        row.name,
                        row.studentId,
                        row.contact,
                        row.teamName,
                        row.submissions?.[stage]?.submitted?.projectName,
                        row.submissions?.[stage]?.draft?.projectName,
                    ].some((value) =>
                        String(value || "")
                            .toLowerCase()
                            .includes(query.trim().toLowerCase())
                    )
            ),
        [rows, track, stage, query]
    );

    const formatDate = (value) =>
        value && /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? value
            : value
              ? new Intl.DateTimeFormat(i18n.language.startsWith("en") ? "en-GB" : "zh-CN", {
                    timeZone: "Asia/Shanghai",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                }).format(new Date(value))
              : "—";

    const updateQualification = async () => {
        if (!pendingRow || saving) return;
        setSaving(true);
        try {
            const response = await api.put("/admin/hackathon/submissions/qualification", {
                eventKey,
                userId: pendingRow.userId,
                track: pendingRow.track,
                qualified: !pendingRow.semifinalQualified,
            });
            setRows((current) =>
                current.map((row) =>
                    row.userId === pendingRow.userId && row.track === pendingRow.track
                        ? {
                              ...row,
                              semifinalQualified: response.data.semifinalQualified,
                              qualificationUpdatedAt: response.data.qualificationUpdatedAt,
                          }
                        : row
                )
            );
            setPendingRow(null);
            toast.success(text("saved"));
        } catch (err) {
            toast.error(err.response?.data?.error || text("save_failed"));
        } finally {
            setSaving(false);
        }
    };

    const downloadFile = async (file) => {
        if (downloadingId !== null) return;
        setDownloadingId(file.id);
        try {
            // Use only the private API route; never send the bearer token to a supplied URL.
            const response = await api.get(
                `/hackathon/submissions/files/${encodeURIComponent(file.id)}`,
                { responseType: "blob" }
            );
            const url = URL.createObjectURL(response.data);
            const link = document.createElement("a");
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            toast.error(text("download_failed"));
        } finally {
            setDownloadingId(null);
        }
    };

    const exportProjects = async () => {
        if (exporting) return;
        setExporting(true);
        try {
            const { data } = await api.get("/admin/hackathon/submissions", {
                params: { event: eventKey },
            });
            const table = submissionExportTable(data, text, (value) =>
                value && /^\d{4}-\d{2}-\d{2}$/.test(value)
                    ? value
                    : value
                      ? new Intl.DateTimeFormat("sv-SE", {
                            timeZone: "Asia/Shanghai",
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                        }).format(new Date(value))
                      : ""
            );
            const url = URL.createObjectURL(
                new Blob([submissionExportCsv(table)], { type: "text/csv;charset=utf-8;" })
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `hackathon_projects_${eventKey}_${new Date(data.serverNow).toISOString().replace(/[:.]/g, "-")}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast.success(text("export_success", { count: table.length - 1 }));
        } catch {
            toast.error(text("export_failed"));
        } finally {
            setExporting(false);
        }
    };

    const renderSnapshot = (snapshot, submitted) => (
        <section className="min-w-0 space-y-2 rounded-xl border border-[rgba(128,146,167,0.2)] p-4">
            <h4 className={`font-bold ${headingTextClass}`}>
                {text(submitted ? "submitted" : "draft")}
            </h4>
            {snapshot ? (
                <>
                    <p className="break-words font-semibold">
                        {snapshot.projectName || snapshot.teamName || text("untitled")}
                    </p>
                    {snapshot.productHighlights && (
                        <p className="whitespace-pre-wrap break-words text-sm">
                            {snapshot.productHighlights}
                        </p>
                    )}
                    <SubmissionAdditionalMaterials snapshot={snapshot} />
                    <dl className="space-y-2 text-sm">
                        {materialKeys
                            .filter(
                                (key) =>
                                    ["githubUrl", "modelscopeUrl"].includes(key) ||
                                    (stage === "semifinal" &&
                                        (key !== "bpFileId" || track === "campus")) ||
                                    (key === "bpFileId" && track === "industry")
                            )
                            .map((key) => {
                                const isFile = key.endsWith("FileId");
                                const file = isFile
                                    ? files.find(
                                          (item) => String(item.id) === String(snapshot[key])
                                      )
                                    : null;
                                const url = isFile ? null : safeWebUrl(snapshot[key]);
                                return (
                                    <div
                                        key={key}
                                        className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                                    >
                                        <dt className={mutedTextClass}>
                                            {key === "modelscopeUrl" && track === "industry"
                                                ? t(
                                                      "aix.challengeWorkspace.industry.projectUrlLabel"
                                                  )
                                                : text(key)}
                                        </dt>
                                        <dd>
                                            {isFile ? (
                                                file ? (
                                                    <button
                                                        type="button"
                                                        className="inline-flex max-w-full items-center gap-2 text-left font-semibold underline underline-offset-4 disabled:opacity-50"
                                                        disabled={downloadingId !== null}
                                                        onClick={() => downloadFile(file)}
                                                    >
                                                        <Download size={15} className="shrink-0" />
                                                        <span className="break-all">
                                                            {downloadingId === file.id
                                                                ? text("downloading")
                                                                : file.name}
                                                        </span>
                                                        <span
                                                            className={`shrink-0 text-xs ${mutedTextClass}`}
                                                        >
                                                            {file.size >= 1024 * 1024
                                                                ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
                                                                : `${Math.max(1, Math.ceil(file.size / 1024))} KB`}
                                                        </span>
                                                    </button>
                                                ) : (
                                                    text(snapshot[key] ? "file_missing" : "missing")
                                                )
                                            ) : url ? (
                                                <a
                                                    className="inline-flex items-center gap-1 font-semibold underline underline-offset-4"
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    {text("open")}
                                                    <ExternalLink size={14} />
                                                </a>
                                            ) : (
                                                text(snapshot[key] ? "invalid_url" : "missing")
                                            )}
                                        </dd>
                                    </div>
                                );
                            })}
                    </dl>
                </>
            ) : (
                <p className={mutedTextClass}>{text(submitted ? "not_submitted" : "no_draft")}</p>
            )}
        </section>
    );

    return (
        <AdminPanel
            title={text("title")}
            description={text("description")}
            action={
                <div className="flex flex-wrap gap-2">
                    <AdminButton
                        tone="subtle"
                        disabled={loading || exporting}
                        onClick={exportProjects}
                    >
                        <Download size={16} />
                        {text(exporting ? "exporting" : "export_projects")}
                    </AdminButton>
                    <AdminButton tone="subtle" disabled={loading || saving} onClick={refresh}>
                        <RefreshCw size={16} />
                        {text("refresh")}
                    </AdminButton>
                </div>
            }
        >
            <HackathonQualificationImport key={eventKey} eventKey={eventKey} onApplied={refresh} />
            <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex flex-wrap gap-2" role="group" aria-label={text("track")}>
                    {["industry", "campus"].map((id) => (
                        <FilterChip
                            key={id}
                            active={track === id}
                            aria-pressed={track === id}
                            onClick={() => setTrack(id)}
                        >
                            {text(id)}
                        </FilterChip>
                    ))}
                </div>
                <div className="flex gap-2" role="group" aria-label={text("stage")}>
                    {["initial", "semifinal"].map((id) => (
                        <FilterChip
                            key={id}
                            active={stage === id}
                            aria-pressed={stage === id}
                            onClick={() => setStage(id)}
                        >
                            {text(id)}
                        </FilterChip>
                    ))}
                </div>
                <input
                    className="theme-admin-input min-h-11 w-full min-w-0 rounded-xl px-3 py-2 sm:max-w-xs"
                    type="search"
                    aria-label={text("search")}
                    placeholder={text("search")}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                />
            </div>
            {loading ? (
                <AdminLoadingState text={text("loading")} />
            ) : error ? (
                <p role="alert" className="py-5 text-red-500">
                    {error}
                </p>
            ) : (
                <>
                    <p role="status" className={`mb-4 text-sm ${mutedTextClass}`}>
                        {text("count", { count: filtered.length })} · {text("timezone")}
                    </p>
                    {!filtered.length && (
                        <p className={`py-8 ${mutedTextClass}`}>{text("empty")}</p>
                    )}
                    <div className="space-y-5">
                        {filtered.map((row) => {
                            const submission = row.submissions?.[stage];
                            return (
                                <article
                                    key={row.rowKey || `${row.registrationId}-${row.track}`}
                                    className="theme-admin-panel rounded-xl p-4 sm:p-5"
                                >
                                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className={`text-lg font-bold ${headingTextClass}`}>
                                                {row.name || text("unnamed")}
                                            </h3>
                                            <p
                                                className={`mt-1 break-words text-sm ${mutedTextClass}`}
                                            >
                                                {[row.studentId, row.contact]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                            {row.teamName && (
                                                <p
                                                    className={`mt-1 break-words text-sm ${mutedTextClass}`}
                                                >
                                                    {text("team_label", { name: row.teamName })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <strong
                                                className={
                                                    row.semifinalQualified
                                                        ? "text-emerald-600"
                                                        : mutedTextClass
                                                }
                                            >
                                                {text(
                                                    row.semifinalQualified
                                                        ? "qualified"
                                                        : "not_qualified"
                                                )}
                                            </strong>
                                            <AdminButton
                                                tone={row.semifinalQualified ? "subtle" : "primary"}
                                                disabled={
                                                    saving || row.canManageQualification === false
                                                }
                                                title={
                                                    row.canManageQualification === false
                                                        ? text("qualificationUnavailable")
                                                        : undefined
                                                }
                                                onClick={() => setPendingRow(row)}
                                            >
                                                {text(
                                                    row.semifinalQualified ? "revoke" : "qualify"
                                                )}
                                            </AdminButton>
                                        </div>
                                    </div>
                                    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                                        <div className="min-w-0">
                                            {renderSnapshot(submission?.submitted, true)}
                                            <p className={`mt-2 text-sm ${mutedTextClass}`}>
                                                {text("submitted_at")}{" "}
                                                {formatDate(submission?.submittedAt)}
                                            </p>
                                        </div>
                                        <div className="min-w-0">
                                            {renderSnapshot(submission?.draft, false)}
                                            <p className={`mt-2 text-sm ${mutedTextClass}`}>
                                                {text("draft_at")}{" "}
                                                {formatDate(submission?.draftUpdatedAt)}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </>
            )}
            <ConfirmDialog
                open={Boolean(pendingRow)}
                pending={saving}
                title={text(pendingRow?.semifinalQualified ? "revoke" : "qualify")}
                description={text(
                    pendingRow?.semifinalQualified ? "revoke_description" : "qualify_description",
                    {
                        name: pendingRow?.name || text("unnamed"),
                        track: text(pendingRow?.track || track),
                    }
                )}
                confirmText={text("confirm")}
                cancelText={text("cancel")}
                pendingText={text("saving")}
                tone={pendingRow?.semifinalQualified ? "danger" : "primary"}
                onConfirm={updateQualification}
                onCancel={() => {
                    if (!saving) setPendingRow(null);
                }}
            />
        </AdminPanel>
    );
}
