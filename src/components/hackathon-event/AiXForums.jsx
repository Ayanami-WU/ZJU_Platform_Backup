import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CalendarDays, MapPin, CheckCircle2 } from "lucide-react";
import api from "../../services/api";
import config from "../../../shared/hackathonForums.json";
import { useReducedMotion } from "framer-motion";
import { useAiXPager } from "../../hooks/useAiXPager";
import AiXChapters from "./AiXChapters";
import "./AiXOverview.css";
import "./AiXPaged.css";
import AiXForumOverview from "./AiXForumOverview";
import AiXRegistrationLock from "./AiXRegistrationLock";
import "./AiXForums.css";
import "./AiXRegistrationPreview.css";
const FORUM_IDS = ["forum-technology", "forum-entrepreneurship", "forum-registration"];
const emptyDetails = (profile = {}) => ({
    name: profile.name || "",
    contact: "",
    organization: "",
    attendeeType: "internal",
    studentId: profile.studentId || "",
    major: profile.major || "",
    grade: profile.grade || "",
    question: "",
    school: "",
    projectExperience: "",
    researchExperience: "",
    aiCapabilities: "",
});
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
    const [details, setDetails] = useState(emptyDetails);
    const [loading, setLoading] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(""),
        [saved, setSaved] = useState(false),
        [retry, setRetry] = useState(0);
    const formRef = useRef(null),
        owner = useRef(user?.id);
    const previousProfile = useRef({});
    const profileDefaults = useRef(emptyDetails());
    profileDefaults.current = emptyDetails(user?.registrationProfile || {});
    if (profileDefaults.current.grade)
        profileDefaults.current.grade = t(`aix.options.${profileDefaults.current.grade}`, {
            defaultValue: profileDefaults.current.grade,
        });
    const savedForum = registrations.find((r) => r.forumKey === "entrepreneurship");
    useEffect(() => {
        const next = profileDefaults.current;
        const previous = previousProfile.current;
        if (!savedForum)
            setDetails((values) => {
                const updated = { ...values };
                for (const key of ["name", "studentId", "major", "grade"]) {
                    if (!values[key] || values[key] === previous[key]) updated[key] = next[key];
                }
                return updated;
            });
        previousProfile.current = next;
    }, [
        user?.id,
        user?.registrationProfile?.name,
        user?.registrationProfile?.studentId,
        user?.registrationProfile?.major,
        user?.registrationProfile?.grade,
        savedForum,
    ]);
    owner.current = user?.id;
    const open = (session) =>
        now >= Date.parse(config.registrationOpensAt) && now < Date.parse(session.startsAt);
    useEffect(() => {
        let active = true;
        setRegistrations([]);
        setSaved(false);
        setBusy(false);
        setError("");
        const defaults = profileDefaults.current;
        setDetails(defaults);
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
                    const fallback =
                        r.attendeeType === "external" ? emptyDetails() : profileDefaults.current;
                    setDetails({
                        ...fallback,
                        ...Object.fromEntries(
                            Object.keys(emptyDetails()).map((key) => [key, r[key] || fallback[key]])
                        ),
                    });
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
    }, [user?.id, retry]);
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
                {
                    sessions,
                    ...details,
                    ...(details.attendeeType === "internal" ? { school: "" } : { studentId: "" }),
                },
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
                            <div className="aix-forum-event-info">
                                <div>
                                    <span className="aix-forum-info-icon">
                                        <CalendarDays size={24} aria-hidden="true" />
                                    </span>
                                    <div>
                                        <time dateTime={entrepreneurship.startsAt}>
                                            {t("aix.forumPage.dateTime")}
                                        </time>
                                    </div>
                                </div>
                                <div>
                                    <span className="aix-forum-info-icon">
                                        <MapPin size={24} aria-hidden="true" />
                                    </span>
                                    <div>
                                        <strong>{t("aix.forumPage.venue")}</strong>
                                        <p>{t("aix.forumPage.address")}</p>
                                    </div>
                                </div>
                            </div>
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
                                    <div
                                        className="aix-forum-attendee-tabs"
                                        role="tablist"
                                        aria-label={t("aix.forumPage.attendeeLabel")}
                                    >
                                        {["internal", "external"].map((type) => (
                                            <button
                                                key={type}
                                                id={`forum-tab-${type}`}
                                                type="button"
                                                role="tab"
                                                aria-selected={details.attendeeType === type}
                                                aria-controls="forum-attendee-fields"
                                                disabled={busy || loading}
                                                onClick={() => {
                                                    setSaved(false);
                                                    setDetails((v) => ({
                                                        ...v,
                                                        attendeeType: type,
                                                    }));
                                                }}
                                            >
                                                {t(`aix.forumPage.attendeeTypes.${type}`)}
                                            </button>
                                        ))}
                                    </div>
                                    <div
                                        role="tabpanel"
                                        id="forum-attendee-fields"
                                        className="aix-registration-lock-region"
                                        aria-labelledby={`forum-tab-${details.attendeeType}`}
                                    >
                                        <fieldset
                                            data-attendee-type={details.attendeeType}
                                            disabled={!user || authLoading || loading || busy}
                                            className={`aix-forum-fields ${!user ? "aix-registration-preview-fields" : ""}`}
                                        >
                                            {[
                                                "school",
                                                "major",
                                                "grade",
                                                "name",
                                                "contact",
                                                "studentId",
                                                "projectExperience",
                                                "researchExperience",
                                                "aiCapabilities",
                                                "question",
                                            ]
                                                .filter((key) =>
                                                    details.attendeeType === "internal"
                                                        ? key !== "school"
                                                        : key !== "studentId"
                                                )
                                                .map((key) => {
                                                    const Input = [
                                                        "question",
                                                        "projectExperience",
                                                        "researchExperience",
                                                        "aiCapabilities",
                                                    ].includes(key)
                                                        ? "textarea"
                                                        : "input";
                                                    return (
                                                        <label
                                                            key={key}
                                                            data-field={key}
                                                            className={
                                                                Input === "textarea" ||
                                                                key === "contact"
                                                                    ? "aix-forum-field-wide"
                                                                    : ""
                                                            }
                                                        >
                                                            <span>
                                                                {t(`aix.forumPage.fields.${key}`)}{" "}
                                                                <span aria-hidden="true">*</span>
                                                            </span>
                                                            <Input
                                                                placeholder={t(
                                                                    `aix.forumPage.placeholders.${key}`,
                                                                    { defaultValue: "" }
                                                                )}
                                                                name={key}
                                                                required
                                                                maxLength={
                                                                    Input === "textarea"
                                                                        ? 2000
                                                                        : key === "contact"
                                                                          ? 30
                                                                          : [
                                                                                  "school",
                                                                                  "major",
                                                                              ].includes(key)
                                                                            ? 160
                                                                            : 80
                                                                }
                                                                type={
                                                                    key === "contact"
                                                                        ? "tel"
                                                                        : undefined
                                                                }
                                                                rows={
                                                                    Input === "textarea"
                                                                        ? 3
                                                                        : undefined
                                                                }
                                                                autoComplete={
                                                                    key === "name"
                                                                        ? "name"
                                                                        : key === "contact"
                                                                          ? "tel"
                                                                          : key === "organization"
                                                                            ? "organization"
                                                                            : "off"
                                                                }
                                                                value={details[key]}
                                                                disabled={
                                                                    !user ||
                                                                    authLoading ||
                                                                    loading ||
                                                                    busy
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
                                                    );
                                                })}
                                        </fieldset>
                                        {!user && (
                                            <AiXRegistrationLock
                                                onLogin={onLogin}
                                                loading={authLoading || loading}
                                            />
                                        )}
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
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
