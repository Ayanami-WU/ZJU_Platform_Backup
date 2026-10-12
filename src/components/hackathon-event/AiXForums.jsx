import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import api from "../../services/api";
import config from "../../../shared/hackathonForums.json";
import { getEventUrl } from "../../utils/hackathonRoute";
import AiXForumOverview from "./AiXForumOverview";
import "./AiXForums.css";
export default function AiXForums({ now, registrationState }) {
    const { t } = useTranslation();
    const { hash, search } = useLocation();
    const requestedSession = config.sessions.find(
        (session) => session.key === new URLSearchParams(search).get("session")
    )?.key;
    const { user, loading: authLoading, onLogin } = registrationState;
    const [registrations, setRegistrations] = useState([]),
        [selected, setSelected] = useState([]);
    const [details, setDetails] = useState({ name: "", contact: "", organization: "" });
    const [loading, setLoading] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [saved, setSaved] = useState(false),
        [retry, setRetry] = useState(0);
    const formRef = useRef(null),
        owner = useRef(user?.id);
    owner.current = user?.id;
    const open = (session) =>
        now >= Date.parse(config.registrationOpensAt) && now < Date.parse(session.startsAt);
    useEffect(() => {
        let active = true;
        setRegistrations([]);
        setSelected(requestedSession ? [requestedSession] : []);
        setSaved(false);
        setBusy(false);
        setError("");
        setDetails({ name: user?.registrationProfile?.name || "", contact: "", organization: "" });
        if (!user) {
            setLoading(false);
            return;
        }
        setLoading(true);
        api.get("/hackathon/forums/registration")
            .then(({ data }) => {
                if (!active) return;
                setRegistrations(data.registrations);
                setSelected([
                    ...new Set([
                        ...data.registrations.map((r) => r.forumKey),
                        ...(requestedSession ? [requestedSession] : []),
                    ]),
                ]);
                if (data.registrations.length) {
                    const r = data.registrations[0];
                    setDetails({ name: r.name, contact: r.contact, organization: r.organization });
                }
            })
            .catch(() => {
                if (active) setError("loadFailed");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [user?.id, user?.registrationProfile?.name, retry, requestedSession]);
    useEffect(() => {
        if (hash !== "#forum-registration") return;
        const frame = requestAnimationFrame(() =>
            formRef.current?.scrollIntoView({ block: "start" })
        );
        return () => cancelAnimationFrame(frame);
    }, [hash]);
    const submit = async (event) => {
        event.preventDefault();
        const sessions = selected.filter((key) =>
            config.sessions.some((s) => s.key === key && open(s))
        );
        if (!sessions.length) {
            setError("chooseSession");
            return;
        }
        const userId = user.id;
        setBusy(true);
        setError("");
        setSaved(false);
        try {
            const { data } = await api.post(
                "/hackathon/forums/register",
                { sessions, ...details },
                { noRetry: true }
            );
            if (owner.current !== userId) return;
            setRegistrations(data.registrations);
            setSaved(true);
        } catch (e) {
            if (owner.current === userId)
                setError(
                    e.response?.data?.code === "FORUM_REGISTRATION_CLOSED"
                        ? "closed"
                        : e.response?.data?.code === "FORUM_INVALID_DETAILS"
                          ? "invalidDetails"
                          : "saveFailed"
                );
        } finally {
            if (owner.current === userId) setBusy(false);
        }
    };
    const cancel = async (key) => {
        const userId = user.id;
        setBusy(true);
        setError("");
        setSaved(false);
        try {
            const { data } = await api.delete(`/hackathon/forums/registration/${key}`, {
                noRetry: true,
            });
            if (owner.current !== userId) return;
            setRegistrations(data.registrations);
            setSelected(data.registrations.map((r) => r.forumKey));
        } catch {
            if (owner.current === userId) setError("saveFailed");
        } finally {
            if (owner.current === userId) setBusy(false);
        }
    };
    const exportRoster = async () => {
        const userId = user.id;
        setBusy(true);
        setError("");
        try {
            const { data } = await api.get("/admin/hackathon/forums/registrations");
            if (owner.current !== userId) return;
            const cell = (v) =>
                '"' +
                String(v ?? "")
                    .replace(/^[=+@-]/, "'$&")
                    .replace(/"/g, '""') +
                '"';
            const rows = [
                ["论坛", "姓名", "联系方式", "学校/单位", "报名时间"],
                ...data.registrations.map((r) => [
                    t(`aix.forumPage.sessions.${r.forumKey}.title`),
                    r.name,
                    r.contact,
                    r.organization,
                    r.createdAt,
                ]),
            ];
            const url = URL.createObjectURL(
                new Blob(["\ufeff" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
                    type: "text/csv;charset=utf-8",
                })
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "AI-X-forum-registrations.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            if (owner.current === userId) setError("saveFailed");
        } finally {
            if (owner.current === userId) setBusy(false);
        }
    };
    return (
        <div className="aix-forums-page">
            <header>
                <Link className="aix-secondary" to={getEventUrl(config.eventKey)}>
                    <ArrowLeft size={16} />
                    {t("aix.forumPage.back")}
                </Link>
                <p className="aix-eyebrow">AI + X · 2026</p>
                <h1>{t("aix.forumPage.title")}</h1>
                <p>{t("aix.forumPage.intro")}</p>
            </header>
            <AiXForumOverview />
            <section className="aix-forum-signup" ref={formRef} id="forum-registration">
                <div className="aix-forum-attendance">
                    <strong>{t("aix.forumPage.attendanceTitle")}</strong>
                    <p>{t("aix.forumPage.attendance")}</p>
                </div>
                {registrations.length > 0 && (
                    <div className="aix-forum-receipts">
                        {config.sessions.map((session) => {
                            const receipt = registrations.find((r) => r.forumKey === session.key);
                            return (
                                receipt && (
                                    <div className="aix-forum-receipt" key={session.key}>
                                        <CheckCircle2 size={17} />
                                        <strong>
                                            {t(`aix.forumPage.sessions.${session.key}.title`)}
                                        </strong>
                                        <span>
                                            {t("aix.forumPage.registered", { id: receipt.id })}
                                        </span>
                                        {open(session) && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => cancel(session.key)}
                                            >
                                                {t("aix.forumPage.cancel")}
                                            </button>
                                        )}
                                    </div>
                                )
                            );
                        })}
                    </div>
                )}
                <h2>{t("aix.forumPage.signupTitle")}</h2>
                <p>{t("aix.forumPage.signupHint")}</p>
                {authLoading || loading ? (
                    <p role="status">{t("aix.loading")}</p>
                ) : !user ? (
                    <button className="aix-primary" onClick={onLogin}>
                        {t("accountProfile.loginOrRegister")}
                    </button>
                ) : error === "loadFailed" ? (
                    <>
                        <p role="alert">{t("aix.forumPage.loadFailed")}</p>
                        <button className="aix-secondary" onClick={() => setRetry((v) => v + 1)}>
                            {t("aix.retry")}
                        </button>
                    </>
                ) : (
                    <form onSubmit={submit}>
                        <fieldset disabled={busy}>
                            <legend>{t("aix.forumPage.chooseSession")}</legend>
                            {config.sessions.filter(open).map((s) => (
                                <label className="aix-forum-checkbox" key={s.key}>
                                    <input
                                        type="checkbox"
                                        checked={selected.includes(s.key)}
                                        onChange={(e) => {
                                            setSaved(false);
                                            setSelected((v) =>
                                                e.target.checked
                                                    ? [...v, s.key]
                                                    : v.filter((k) => k !== s.key)
                                            );
                                        }}
                                    />
                                    {t(`aix.forumPage.sessions.${s.key}.title`)}
                                </label>
                            ))}
                        </fieldset>
                        <div className="aix-forum-fields">
                            {["name", "contact", "organization"].map((key) => (
                                <label key={key}>
                                    {t(`aix.forumPage.fields.${key}`)}
                                    <input
                                        required={key !== "organization"}
                                        maxLength={
                                            key === "name" ? 80 : key === "contact" ? 120 : 160
                                        }
                                        autoComplete={
                                            key === "name"
                                                ? "name"
                                                : key === "organization"
                                                  ? "organization"
                                                  : "email"
                                        }
                                        value={details[key]}
                                        disabled={busy}
                                        onChange={(e) => {
                                            setSaved(false);
                                            setDetails((v) => ({ ...v, [key]: e.target.value }));
                                        }}
                                    />
                                </label>
                            ))}
                        </div>
                        {error && <p role="alert">{t(`aix.forumPage.${error}`)}</p>}
                        {saved && (
                            <p className="aix-forum-success" role="status">
                                {t("aix.forumPage.success")}
                            </p>
                        )}
                        <button
                            type="submit"
                            className="aix-primary"
                            disabled={busy || !config.sessions.some(open)}
                        >
                            {t(busy ? "aix.forumPage.saving" : "aix.forumPage.submit")}
                        </button>
                    </form>
                )}
                {user?.role === "admin" && (
                    <button
                        className="aix-secondary aix-forum-export"
                        disabled={busy}
                        onClick={exportRoster}
                    >
                        {t("aix.forumPage.export")}
                    </button>
                )}
            </section>
        </div>
    );
}
