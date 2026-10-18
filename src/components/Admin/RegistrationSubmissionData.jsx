import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import api from "../../services/api";
import { AIX_EVENT_KEY, safeWebUrl } from "../../utils/hackathonAiX";

export default function RegistrationSubmissionData({ registration }) {
    const { t } = useTranslation();
    const text = (key) => t(`admin.hackathon_submissions.${key}`);
    const [downloading, setDownloading] = useState(null);
    if (registration.event_key !== AIX_EVENT_KEY) return <span>—</span>;
    if (!registration.submissionDataLoaded) return <span>{text("load_failed")}</span>;
    if (!registration.submissionRecords.length) return <span>{text("registration_none")}</span>;
    const date = (value) =>
        value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "—";
    const download = async (file) => {
        if (downloading !== null) return;
        setDownloading(file.id);
        try {
            const { data } = await api.get(
                `/hackathon/submissions/files/${encodeURIComponent(file.id)}`,
                { responseType: "blob" }
            );
            const url = URL.createObjectURL(data);
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
            setDownloading(null);
        }
    };
    const snapshot = (value) =>
        value && (
            <dl className="space-y-2 break-words">
                <div>
                    <dt>{text("projectName")}</dt>
                    <dd className="font-semibold">{value.projectName || text("untitled")}</dd>
                </div>
                {value.productHighlights && (
                    <div>
                        <dt>{text("productHighlights")}</dt>
                        <dd>{value.productHighlights}</dd>
                    </div>
                )}
                {["githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"].map((key) => {
                    if (!value[key]) return null;
                    const url = key.endsWith("FileId") ? null : safeWebUrl(value[key]);
                    const file = registration.submissionFiles.find(
                        (item) => String(item.id) === String(value[key])
                    );
                    return (
                        <div key={key}>
                            <dt>{text(key)}</dt>
                            <dd>
                                {url ? (
                                    <a
                                        className="break-all underline"
                                        href={url}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {value[key]}
                                    </a>
                                ) : file ? (
                                    <button
                                        type="button"
                                        className="break-all text-left underline disabled:opacity-50"
                                        disabled={downloading !== null}
                                        onClick={() => download(file)}
                                    >
                                        {downloading === file.id ? text("downloading") : file.name}
                                    </button>
                                ) : (
                                    <span>
                                        {text(
                                            key.endsWith("FileId") ? "file_missing" : "invalid_url"
                                        )}
                                    </span>
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        );
    return (
        <div className="min-w-[220px] max-w-[380px] space-y-3 text-xs leading-5">
            {registration.submissionRecords.map((record) => (
                <details key={record.id} className="space-y-2">
                    <summary className="cursor-pointer break-words font-semibold">
                        {text(record.track)} · {text(record.stage)} ·{" "}
                        {text(record.submittedAt ? "registration_submitted" : "registration_draft")}
                        <span className="block font-normal">
                            {record.submitted?.projectName ||
                                record.draft?.projectName ||
                                text("untitled")}
                        </span>
                    </summary>
                    {record.submitted && (
                        <section>
                            <p className="font-semibold">{text("submitted")}</p>
                            <p>
                                {text("submitted_at")}：{date(record.submittedAt)}
                            </p>
                            {snapshot(record.submitted)}
                        </section>
                    )}
                    {record.draft && (
                        <section>
                            <p className="font-semibold">{text("draft")}</p>
                            <p>
                                {text("draft_at")}：{date(record.draftUpdatedAt)}
                            </p>
                            {snapshot(record.draft)}
                        </section>
                    )}
                </details>
            ))}
        </div>
    );
}
