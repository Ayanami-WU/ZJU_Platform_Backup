import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, CheckCircle2, Save, Send, Upload, Download, FileCheck2 } from "lucide-react";
import api from "../../services/api";
import { safeWebUrl } from "../../utils/hackathonAiX";
import AiXRegistrationLock from "./AiXRegistrationLock";

export const emptyMaterials = () => ({
    projectName: "",
    productHighlights: "",
    githubUrl: "",
    modelscopeUrl: "",
    bpFileId: "",
    demoFileId: "",
});
const materialKeys = [
    "projectName",
    "productHighlights",
    "githubUrl",
    "modelscopeUrl",
    "bpFileId",
    "demoFileId",
];
const equalMaterials = (a, b) => materialKeys.every((key) => (a?.[key] || "") === (b?.[key] || ""));

export const requiredMaterialFields = (gate, track, stage) => [
    ...new Set([
        "projectName",
        ...(gate?.requiredFields ||
            (stage === "initial" && track !== "campus"
                ? ["productHighlights", "githubUrl", "modelscopeUrl"]
                : track === "campus"
                  ? ["githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"]
                  : ["productHighlights", "githubUrl", "modelscopeUrl", "demoFileId"])),
    ]),
];

export const displayMaterialFields = (gate, track, stage) => [
    ...new Set([
        ...requiredMaterialFields(gate, track, stage),
        ...(track === "industry" && stage !== "final" ? ["productHighlights"] : []),
    ]),
];

export default function AiXStageSubmission({
    eventKey,
    track,
    stage,
    gate,
    record,
    files = [],
    legacyRepositories,
    onFile,
    onBusyChange,
    user,
    loading,
    onLogin,
    accessNotice,
    cachedDraft,
    onDraft,
    onRecord,
    onReload,
    formatDate,
}) {
    const { t } = useTranslation();
    const label = (key, options) => t(`aix.challengeWorkspace.${key}`, options);
    const [materials, setMaterials] = useState(
        () => cachedDraft || record?.draft || emptyMaterials()
    );
    const [version, setVersion] = useState(record?.version || 0);
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [invalidField, setInvalidField] = useState("");
    const [conflict, setConflict] = useState(null);
    const [notice, setNotice] = useState("");
    const [uploading, setUploading] = useState("");
    const [progress, setProgress] = useState(0);
    const [downloading, setDownloading] = useState(null);
    useEffect(() => {
        onBusyChange?.(Boolean(busy || uploading));
        return () => onBusyChange?.(false);
    }, [busy, uploading, onBusyChange]);
    const required = requiredMaterialFields(gate, track, stage);
    const fields = displayMaterialFields(gate, track, stage);
    const dirty = !equalMaterials(materials, record?.draft);
    const pendingFormal = record?.submitted && !equalMaterials(materials, record.submitted);
    const disabled = !user || loading || Boolean(busy) || Boolean(uploading) || !gate?.canSave;
    const state = dirty
        ? "unsaved"
        : record?.submitted
          ? pendingFormal
              ? "draftAfterSubmit"
              : "submitted"
          : record?.draftUpdatedAt
            ? "draftSaved"
            : "notSubmitted";

    const persist = async (action) => {
        if (busy || conflict || disabled || (action === "submit" && !gate?.canSubmit)) return;
        setError("");
        setInvalidField("");
        setNotice("");
        if (action === "submit" && !materials.projectName?.trim()) {
            setInvalidField("projectName");
            setError(label("projectNameRequired"));
            return;
        }
        const invalid = fields.find(
            (field) =>
                ["githubUrl", "modelscopeUrl"].includes(field) &&
                ((action === "submit" && required.includes(field) && !materials[field]?.trim()) ||
                    (materials[field]?.trim() &&
                        !/^https:\/\//i.test(safeWebUrl(materials[field].trim()) || "")))
        );
        if (invalid) {
            setInvalidField(invalid);
            setError(label("invalidUrl", { field: label(`fields.${invalid}`) }));
            return;
        }
        if (
            action === "submit" &&
            required.includes("productHighlights") &&
            !materials.productHighlights?.trim()
        ) {
            setInvalidField("productHighlights");
            setError(label("productHighlightsRequired"));
            return;
        }
        const missingFile =
            action === "submit" &&
            required.find((field) => field.endsWith("FileId") && !materials[field]);
        if (missingFile) {
            setError(label("missingFile", { field: label(`fields.${missingFile}`) }));
            return;
        }
        setBusy(action);
        try {
            const { data } = await api.put(
                "/hackathon/submissions",
                {
                    eventKey,
                    track,
                    stage,
                    action,
                    expectedVersion: version,
                    materials: { ...materials, projectName: materials.projectName?.trim() || "" },
                },
                { noRetry: true }
            );
            setVersion(data.submission.version);
            setMaterials({ ...emptyMaterials(), ...data.submission.draft });
            onDraft(data.submission.draft);
            onRecord(data.submission);
            setNotice(label(action === "submit" ? "submitSuccess" : "saveSuccess"));
        } catch (e) {
            const response = e.response?.data;
            if (response?.code === "HACKATHON_SUBMISSION_CONFLICT") {
                setError(label("conflict"));
                try {
                    const latest = await onReload();
                    setConflict({
                        record:
                            latest?.submissions?.find(
                                (item) => item.track === track && item.stage === stage
                            ) || null,
                    });
                } catch {
                    setError(label("conflictLoadFailed"));
                }
            } else if (response?.code === "HACKATHON_SUBMISSION_BLOCKED") {
                setError(label(`blocked.${response.reason}`, { defaultValue: label("failed") }));
                onReload().catch(() => {});
            } else {
                setInvalidField(response?.field || "");
                setError(
                    response?.code === "HACKATHON_SUBMISSION_INVALID"
                        ? label(
                              response.field === "projectName"
                                  ? "projectNameRequired"
                                  : response.field?.endsWith("FileId")
                                    ? "missingFile"
                                    : "invalidUrl",
                              {
                                  field: label(`fields.${response.field}`, {
                                      defaultValue: label("material"),
                                  }),
                              }
                          )
                        : label("failed")
                );
            }
        } finally {
            setBusy("");
        }
    };

    const download = async (id) => {
        const file = files.find((item) => String(item.id) === String(id));
        if (!file || downloading) return;
        setDownloading(id);
        setError("");
        try {
            const path = file.downloadUrl?.replace(/^\/api\//, "/");
            if (!path?.startsWith("/hackathon/submissions/files/"))
                throw new Error("Invalid download path");
            const { data } = await api.get(path, { responseType: "blob" });
            const url = URL.createObjectURL(data);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = file.name;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            setError(label("downloadFailed"));
        } finally {
            setDownloading(null);
        }
    };
    const upload = async (field, file) => {
        if (!file || disabled) return;
        const bp = field === "bpFileId";
        const maximum = (bp ? 30 : 200) * 1024 * 1024;
        const extension = file.name.split(".").at(-1)?.toLowerCase();
        if (
            !(bp ? ["pdf", "ppt", "pptx"] : ["mp4", "webm", "mov"]).includes(extension) ||
            file.size > maximum
        ) {
            setError(label(bp ? "bpFileError" : "demoFileError"));
            return;
        }
        const body = new FormData();
        body.append("file", file);
        body.append("eventKey", eventKey);
        body.append("track", track);
        body.append("stage", stage);
        body.append("kind", bp ? "bp" : "demo");
        setUploading(field);
        setProgress(0);
        setError("");
        setNotice("");
        try {
            const { data } = await api.post("/hackathon/submissions/files", body, {
                noRetry: true,
                headers: { "Content-Type": "multipart/form-data" },
                onUploadProgress: (event) =>
                    setProgress(
                        event.total
                            ? Math.min(99, Math.round((event.loaded / event.total) * 100))
                            : 0
                    ),
            });
            const next = { ...materials, [field]: data.file.id };
            setMaterials(next);
            onDraft(next);
            onFile(data.file);
        } catch (error) {
            setError(
                error.response?.data?.code === "HACKATHON_SUBMISSION_BLOCKED"
                    ? label(`blocked.${error.response.data.reason}`)
                    : label("uploadFailed")
            );
        } finally {
            setUploading("");
            setProgress(0);
        }
    };
    const fileSize = (size) =>
        size < 1024 * 1024
            ? `${Math.max(1, Math.round(size / 1024))} KB`
            : `${(size / 1024 / 1024).toFixed(1)} MB`;

    return (
        <section
            className="aix-task-submission"
            id="submission"
            aria-labelledby="aix-submission-title"
        >
            <header className="aix-task-panel-heading">
                <h2 id="aix-submission-title">{label("mySubmission")}</h2>
                {user && (
                    <span
                        className={`aix-task-state ${record?.submitted ? "is-submitted" : ""}`}
                        role="status"
                    >
                        {label(state)}
                    </span>
                )}
            </header>
            {accessNotice}
            <form
                noValidate
                onSubmit={(event) => {
                    event.preventDefault();
                    persist("submit");
                }}
            >
                <div className="aix-registration-lock-region">
                    <fieldset
                        disabled={disabled}
                        className={!user ? "aix-registration-preview-fields" : ""}
                    >
                        {fields.map((field) => {
                            const isFile = field.endsWith("FileId");
                            const file = files.find(
                                (item) => String(item.id) === String(materials[field])
                            );
                            return (
                                <div
                                    key={field}
                                    className={`aix-task-field ${field === "projectName" ? "aix-task-field-wide" : ""} ${isFile ? "aix-task-field-upload" : ""}`}
                                >
                                    <label htmlFor={`material-${track}-${stage}-${field}`}>
                                        <span>
                                            {label(`fields.${field}`)}{" "}
                                            {required.includes(field) && (
                                                <span aria-hidden="true">*</span>
                                            )}
                                        </span>
                                        {isFile ? (
                                            <>
                                                <span className="aix-task-file-picker">
                                                    <Upload size={18} />
                                                    {label(file ? "replaceFile" : "uploadFile")}
                                                    <input
                                                        id={`material-${track}-${stage}-${field}`}
                                                        name={field}
                                                        type="file"
                                                        accept={
                                                            field === "bpFileId"
                                                                ? ".pdf,.ppt,.pptx"
                                                                : ".mp4,.webm,.mov"
                                                        }
                                                        onChange={(event) => {
                                                            upload(field, event.target.files?.[0]);
                                                            event.target.value = "";
                                                        }}
                                                    />
                                                </span>
                                                <small className="aix-task-muted">
                                                    {label(
                                                        field === "bpFileId"
                                                            ? "bpFileHint"
                                                            : "demoFileHint"
                                                    )}
                                                </small>
                                            </>
                                        ) : field === "productHighlights" ? (
                                            <textarea
                                                id={`material-${track}-${stage}-${field}`}
                                                name={field}
                                                required={required.includes(field)}
                                                maxLength={1000}
                                                rows={4}
                                                value={materials[field] || ""}
                                                placeholder={label(`placeholders.${field}`)}
                                                aria-invalid={invalidField === field || undefined}
                                                aria-describedby={
                                                    invalidField === field
                                                        ? "aix-material-error"
                                                        : undefined
                                                }
                                                onChange={(event) => {
                                                    const next = {
                                                        ...materials,
                                                        [field]: event.target.value,
                                                    };
                                                    setMaterials(next);
                                                    onDraft(next);
                                                    setNotice("");
                                                    setError("");
                                                    setInvalidField("");
                                                }}
                                            />
                                        ) : (
                                            <input
                                                id={`material-${track}-${stage}-${field}`}
                                                name={field}
                                                type={field === "projectName" ? "text" : "url"}
                                                inputMode={field === "projectName" ? "text" : "url"}
                                                required={required.includes(field)}
                                                maxLength={field === "projectName" ? 160 : 2000}
                                                autoCapitalize="none"
                                                autoCorrect="off"
                                                spellCheck={false}
                                                value={materials[field] || ""}
                                                placeholder={label(`placeholders.${field}`)}
                                                aria-invalid={invalidField === field || undefined}
                                                aria-describedby={
                                                    invalidField === field
                                                        ? "aix-material-error"
                                                        : undefined
                                                }
                                                onChange={(event) => {
                                                    const next = {
                                                        ...materials,
                                                        [field]: event.target.value,
                                                    };
                                                    setMaterials(next);
                                                    onDraft(next);
                                                    setNotice("");
                                                    setError("");
                                                    setInvalidField("");
                                                }}
                                            />
                                        )}
                                    </label>
                                    {file && (
                                        <div className="aix-task-file-attached">
                                            <FileCheck2 size={18} />
                                            <span>
                                                {file.name}
                                                <small>{fileSize(file.size)}</small>
                                            </span>
                                        </div>
                                    )}
                                    {uploading === field && (
                                        <div className="aix-task-upload-progress" role="status">
                                            <progress value={progress} max={100} />
                                            {label("uploadProgress", { progress })}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </fieldset>
                    <p className="aix-task-help">{label("accessibleLinks")}</p>
                    {!user && (
                        <AiXRegistrationLock
                            onLogin={onLogin}
                            loading={loading}
                            message={label("loginHint")}
                        />
                    )}
                </div>
                {fields
                    .filter((field) => field.endsWith("FileId") && materials[field])
                    .map((field) => (
                        <button
                            key={field}
                            type="button"
                            className="aix-task-download"
                            disabled={Boolean(downloading)}
                            onClick={() => download(materials[field])}
                        >
                            <Download size={16} />
                            {label("downloadFile", { field: label(`fields.${field}`) })}
                        </button>
                    ))}
                {error && (
                    <p id="aix-material-error" className="aix-task-error" role="alert">
                        {error}
                    </p>
                )}
                {conflict && (
                    <div className="aix-task-conflict">
                        <button
                            className="aix-secondary"
                            type="button"
                            onClick={() => {
                                const next = { ...emptyMaterials(), ...conflict.record?.draft };
                                setMaterials(next);
                                onDraft(next);
                                setVersion(conflict.record?.version || 0);
                                setConflict(null);
                                setError("");
                            }}
                        >
                            {label("loadSaved")}
                        </button>
                        <button
                            className="aix-secondary"
                            type="button"
                            onClick={() => {
                                setVersion(conflict.record?.version || 0);
                                setConflict(null);
                                setError("");
                            }}
                        >
                            {label("keepMine")}
                        </button>
                    </div>
                )}
                {notice && (
                    <p className="aix-task-confirmation" role="status">
                        <CheckCircle2 size={18} />
                        {notice}
                    </p>
                )}
                {record?.draftUpdatedAt && (
                    <p className="aix-task-timestamp">
                        {label("savedAt", { time: formatDate(record.draftUpdatedAt) })}
                    </p>
                )}
                {gate?.state !== "closed" && (
                    <>
                        <div className="aix-task-actions">
                            <button
                                className="aix-secondary"
                                type="button"
                                onClick={() => persist("save")}
                                disabled={disabled || Boolean(conflict)}
                            >
                                <Save size={18} />
                                {label(busy === "save" ? "saving" : "saveDraft")}
                            </button>
                            <button
                                className="aix-primary"
                                type="submit"
                                disabled={disabled || !gate?.canSubmit || Boolean(conflict)}
                            >
                                <Send size={18} />
                                {label(
                                    busy === "submit"
                                        ? "submitting"
                                        : record?.submitted
                                          ? "updateSubmission"
                                          : "submit"
                                )}
                            </button>
                        </div>
                        <p className="aix-task-help">{label("saveHint")}</p>
                    </>
                )}
            </form>
            {record?.submitted && (
                <details className="aix-task-receipt" open={gate?.state === "closed"}>
                    <summary>
                        <CheckCircle2 size={18} />
                        {label("formalReceipt")} · {formatDate(record.submittedAt)}
                    </summary>
                    <dl>
                        {fields
                            .filter((key) => record.submitted[key])
                            .map((key) => (
                                <div key={key}>
                                    <dt>{label(`fields.${key}`)}</dt>
                                    <dd>
                                        {key === "projectName" ? (
                                            record.submitted[key]
                                        ) : key.endsWith("FileId") ? (
                                            <button
                                                type="button"
                                                className="aix-task-download"
                                                disabled={Boolean(downloading)}
                                                onClick={() => download(record.submitted[key])}
                                            >
                                                {files.find(
                                                    (file) =>
                                                        String(file.id) ===
                                                        String(record.submitted[key])
                                                )?.name || label("openMaterial")}
                                                <Download size={16} />
                                            </button>
                                        ) : (
                                            <a
                                                href={
                                                    safeWebUrl(record.submitted[key]) || undefined
                                                }
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {label("openMaterial")}
                                                <ArrowUpRight size={16} />
                                            </a>
                                        )}
                                    </dd>
                                </div>
                            ))}
                    </dl>
                </details>
            )}
            {legacyRepositories &&
                ["githubUrl", "modelscopeUrl"].some((key) =>
                    safeWebUrl(legacyRepositories[key])
                ) && (
                    <details className="aix-task-history">
                        <summary>{label("legacyTitle")}</summary>
                        <p>{label("legacyHint")}</p>
                        {["githubUrl", "modelscopeUrl"]
                            .filter((key) => safeWebUrl(legacyRepositories[key]))
                            .map((key) => (
                                <a
                                    key={key}
                                    href={safeWebUrl(legacyRepositories[key])}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {key === "githubUrl" ? "GitHub" : "ModelScope"}
                                    <ArrowUpRight size={16} />
                                </a>
                            ))}
                    </details>
                )}
        </section>
    );
}
