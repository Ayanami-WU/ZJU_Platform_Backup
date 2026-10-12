import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";
import api from "../../services/api";
import config from "../../../shared/hackathonForums.json";
import { useReducedMotion } from "framer-motion";
import { useAiXPager } from "../../hooks/useAiXPager";
import AiXChapters from "./AiXChapters";
import "./AiXOverview.css";
import "./AiXPaged.css";
import AiXForumOverview from "./AiXForumOverview";
import "./AiXForums.css";
import "./AiXRegistrationPreview.css";
const FORUM_IDS = ["forum-technology", "forum-entrepreneurship", "forum-registration"];
const entrepreneurship = config.sessions.find((s) => s.key === "entrepreneurship");
export default function AiXForums({ now, registrationState }) {
    const { t } = useTranslation();
    const { hash } = useLocation();
    const pageRef = useRef(null);
    const reduceMotion = useReducedMotion();
    useAiXPager(pageRef, FORUM_IDS, true, reduceMotion);
    const goTo = (id) => {
        const root = pageRef.current,
            target = root?.querySelector(`#${id}`);
        if (target)
            root.scrollTo({ top: target.offsetTop, behavior: reduceMotion ? "instant" : "smooth" });
    };
    const { user, loading: authLoading, onLogin } = registrationState;
    const [registrations, setRegistrations] = useState([]);
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
                if (data.registrations.length) {
                    const r =
                        data.registrations.find((r) => r.forumKey === "entrepreneurship") ||
                        data.registrations[0];
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
    }, [user?.id, user?.registrationProfile?.name, retry]);
    useEffect(() => {
        if (!FORUM_IDS.includes(hash.slice(1))) return;
        const frame = requestAnimationFrame(() =>
            pageRef.current?.querySelector(hash)?.scrollIntoView({ block: "start" })
        );
        return () => cancelAnimationFrame(frame);
    }, [hash]);
    const submit = async (event) => {
        event.preventDefault();
        if (!user || authLoading || loading || busy) return;
        if (!open(entrepreneurship)) {
            setError("closed");
            return;
        }
        const sessions = ["entrepreneurship"];
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
        <div className="aix-forums-page" ref={pageRef} tabIndex={0}>
            <AiXChapters
                containerRef={pageRef}
                onSelect={goTo}
                ids={FORUM_IDS}
                labels={t("aix.forumPage.chapters", { returnObjects: true })}
            />
            <AiXForumOverview />
            <section className="aix-page" ref={formRef} id="forum-registration">
                <div className="aix-page-body">
                    <header className="aix-page-heading">
                        <span>03</span>
                        <h2>{t("aix.forumPage.signupTitle")}</h2>
                    </header>
                    <div className="aix-forum-registration-layout">
                        <aside className="aix-forum-registration-summary">
                            <p className="aix-eyebrow">AI + X · 2026</p>
                            <h3>{t("aix.pages.forumOverview.sessions.1.theme")}</h3>
                            <time>10.25</time>
                            <p>{t("aix.pages.forumOverview.sessions.1.location")}</p>
                        </aside>
                        <div className="aix-forum-signup">
                            {registrations.length > 0 && (
                                <div className="aix-forum-receipts">
                                    {config.sessions.map((session) => {
                                        const receipt = registrations.find(
                                            (r) => r.forumKey === session.key
                                        );
                                        return (
                                            receipt && (
                                                <div
                                                    className="aix-forum-receipt"
                                                    key={session.key}
                                                >
                                                    <CheckCircle2 size={17} />
                                                    <strong>
                                                        {t(
                                                            `aix.forumPage.sessions.${session.key}.title`
                                                        )}
                                                    </strong>
                                                    <span>
                                                        {t("aix.forumPage.registered", {
                                                            id: receipt.id,
                                                        })}
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
                            <p>{t("aix.forumPage.signupHint")}</p>
                            {!user && (
                                <div className="aix-registration-login-notice">
                                    <p>
                                        {t("aix.register.loginPreview", {
                                            defaultValue: "请先注册或登录，再填写报名信息。",
                                        })}
                                    </p>
                                    <button
                                        type="button"
                                        className="aix-primary"
                                        onClick={onLogin}
                                        disabled={authLoading}
                                    >
                                        {t("accountProfile.loginOrRegister")}
                                    </button>
                                </div>
                            )}
                            {(authLoading || loading) && <p role="status">{t("aix.loading")}</p>}
                            {user && error === "loadFailed" ? (
                                <>
                                    <p role="alert">{t("aix.forumPage.loadFailed")}</p>
                                    <button
                                        className="aix-secondary"
                                        onClick={() => setRetry((v) => v + 1)}
                                    >
                                        {t("aix.retry")}
                                    </button>
                                </>
                            ) : (
                                <form onSubmit={submit}>
                                    <fieldset
                                        disabled={!user || authLoading || loading || busy}
                                        className={`aix-forum-fields ${!user ? "aix-registration-preview-fields" : ""}`}
                                    >
                                        {["name", "contact", "organization"].map((key) => (
                                            <label key={key}>
                                                {t(`aix.forumPage.fields.${key}`)}
                                                <input
                                                    required={key !== "organization"}
                                                    maxLength={
                                                        key === "name"
                                                            ? 80
                                                            : key === "contact"
                                                              ? 120
                                                              : 160
                                                    }
                                                    autoComplete={
                                                        key === "name"
                                                            ? "name"
                                                            : key === "organization"
                                                              ? "organization"
                                                              : "email"
                                                    }
                                                    value={details[key]}
                                                    disabled={
                                                        !user || authLoading || loading || busy
                                                    }
                                                    onChange={(e) => {
                                                        setSaved(false);
                                                        setDetails((v) => ({
                                                            ...v,
                                                            [key]: e.target.value,
                                                        }));
                                                    }}
                                                />
                                            </label>
                                        ))}
                                    </fieldset>
                                    {error && <p role="alert">{t(`aix.forumPage.${error}`)}</p>}
                                    {saved && (
                                        <p className="aix-forum-success" role="status">
                                            {t("aix.forumPage.success")}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        className="aix-primary"
                                        disabled={
                                            !user ||
                                            authLoading ||
                                            loading ||
                                            busy ||
                                            !open(entrepreneurship)
                                        }
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
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
