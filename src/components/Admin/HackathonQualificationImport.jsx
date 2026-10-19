import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload } from "lucide-react";
import toast from "react-hot-toast";
import api from "../../services/api";
import { AdminButton } from "./AdminUI";

export default function HackathonQualificationImport({ eventKey, onApplied }) {
    const { t } = useTranslation();
    const text = (key, options) => t(`admin.qualificationImport.${key}`, options);
    const fileInput = useRef(null);
    const [members, setMembers] = useState(null);
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const review = async (list) => {
        setError("");
        setPreview(null);
        setBusy(true);
        try {
            const { data } = await api.post(
                "/admin/hackathon/submissions/qualifications/batch",
                {
                    eventKey,
                    members: list,
                    apply: false,
                },
                { noRetry: true }
            );
            setPreview({ ...data, eventKey });
        } catch (err) {
            setError(err.response?.data?.error || text("failed"));
        } finally {
            setBusy(false);
        }
    };
    const importFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || busy) return;
        setPreview(null);
        setMembers(null);
        setError("");
        try {
            if (file.size > 1024 * 1024) throw new Error(text("invalid"));
            const parsed = JSON.parse(await file.text());
            if ((parsed.eventKey && parsed.eventKey !== eventKey) || !Array.isArray(parsed.members))
                throw new Error(text("invalid"));
            setMembers(parsed.members);
            await review(parsed.members);
        } catch {
            setError(text("invalid"));
        }
    };
    const apply = async () => {
        if (busy || !preview || preview.eventKey !== eventKey) return;
        setBusy(true);
        setError("");
        try {
            const { data } = await api.post(
                "/admin/hackathon/submissions/qualifications/batch",
                {
                    eventKey,
                    members,
                    apply: true,
                    expectedFingerprint: preview.fingerprint,
                },
                { noRetry: true }
            );
            setPreview(null);
            setMembers(null);
            toast.success(text("success", { count: data.rows.length, granted: data.granted }));
            onApplied();
        } catch (err) {
            setError(err.response?.data?.error || text("failed"));
        } finally {
            setBusy(false);
        }
    };
    const currentPreview = preview?.eventKey === eventKey ? preview : null;
    return (
        <section className="mb-5 space-y-3">
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={importFile}
                aria-label={text("import")}
            />
            <AdminButton tone="subtle" disabled={busy} onClick={() => fileInput.current?.click()}>
                <Upload size={16} />
                {text(busy ? "checking" : "import")}
            </AdminButton>
            {error && (
                <p role="alert" className="text-red-500">
                    {error}
                </p>
            )}
            {currentPreview && (
                <div className="theme-admin-panel space-y-3 rounded-xl border border-emerald-500/40 p-4">
                    <h4 className="font-bold">
                        {text("preview", { count: currentPreview.rows.length })}
                    </h4>
                    <p className="text-sm">{text("hint")}</p>
                    <p className="text-sm font-semibold" role="status">
                        {text("summary", {
                            existing: currentPreview.rows.filter((row) => row.qualified).length,
                            newCount: currentPreview.rows.filter((row) => !row.qualified).length,
                        })}
                    </p>
                    <div className="max-h-80 overflow-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr>
                                    <th className="p-2">{text("name")}</th>
                                    <th className="p-2">{text("team")}</th>
                                    <th className="p-2">{text("account")}</th>
                                    <th className="p-2">{text("status")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentPreview.rows.map((row) => (
                                    <tr key={row.userId} className="border-t border-slate-500/20">
                                        <td className="p-2">{row.name}</td>
                                        <td className="p-2">{row.teamName || "—"}</td>
                                        <td className="p-2">{row.userId}</td>
                                        <td className="p-2">
                                            {text(row.qualified ? "existing" : "new")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <AdminButton disabled={busy} onClick={apply}>
                            {text("apply", { count: currentPreview.rows.length })}
                        </AdminButton>
                        <AdminButton tone="subtle" disabled={busy} onClick={() => review(members)}>
                            {text("recheck")}
                        </AdminButton>
                        <AdminButton
                            tone="subtle"
                            disabled={busy}
                            onClick={() => {
                                setPreview(null);
                                setMembers(null);
                            }}
                        >
                            {text("cancel")}
                        </AdminButton>
                    </div>
                </div>
            )}
        </section>
    );
}
