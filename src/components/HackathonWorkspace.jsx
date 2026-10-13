import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Gift } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { registrationOpen, eventTimestamp } from "../utils/hackathonAiX";
import forumConfig from "../../shared/hackathonForums.json";
import SEO from "./SEO";
import LotteryModal from "../features/lottery/LotteryModal";
import HackathonEventPicker from "./HackathonEventPicker";
import HackathonEventContent from "./HackathonEventContent";
import { getEventViews, getEventView, getEventUrl } from "../utils/hackathonRoute";
import "./HackathonShared.css";
import "./HackathonWorkspace.css";
import "./hackathon-event/ResultsXTheme.css";
import "./hackathon-event/AiXTheme.css";
import "./hackathon-event/AiXPaged.css";
import "./hackathon-event/AiXTypography.css";
import "./hackathon-event/AiXResponsive.css";
// Event identity, navigation and signup belong to one shell. Edition bodies own their content.
export default function HackathonWorkspace({ template, schedule }) {
    const { t } = useTranslation();
    const { user, loading: authLoading } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const view = getEventView(location);
    const [now, setNow] = useState(Date.now);
    const registrationRef = useRef(null);
    const [registration, setRegistration] = useState(null);
    const [registrationLoading, setRegistrationLoading] = useState(false);
    const [registrationError, setRegistrationError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [lotteryOpen, setLotteryOpen] = useState(false);
    const resumeLottery = useRef(false);
    useEffect(() => {
        if (user && resumeLottery.current) {
            resumeLottery.current = false;
            setLotteryOpen(true);
        }
    }, [user]);
    const event = template.event;
    const registrationOwner = useRef({ userId: user?.id, eventKey: event.key });
    useLayoutEffect(() => {
        registrationOwner.current = { userId: user?.id, eventKey: event.key };
    }, [user?.id, event.key]);
    const workspaceRef = useRef(null);
    useLayoutEffect(() => {
        const navbar = document.querySelector("[data-site-navbar]");
        if (!navbar) return;
        const measure = () =>
            workspaceRef.current?.style.setProperty(
                "--site-nav-height",
                `${navbar.getBoundingClientRect().height}px`
            );
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(navbar);
        return () => observer.disconnect();
    }, [event.key]);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 30000);
        return () => window.clearInterval(timer);
    }, []);
    useEffect(() => {
        let active = true;
        setRegistration(null);
        setRegistrationError(false);
        if (!user) {
            setRegistrationLoading(false);
            return;
        }
        setRegistrationLoading(true);
        api.get("/hackathon/registration", { params: { event: event.key } })
            .then(({ data }) => {
                if (active) setRegistration(data.registration);
            })
            .catch(() => {
                if (active) setRegistrationError(true);
            })
            .finally(() => {
                if (active) setRegistrationLoading(false);
            });
        return () => {
            active = false;
        };
    }, [user?.id, event.key, retry]);
    const showRegistration = () => {
        if (view === "forums") {
            document
                .getElementById("forum-registration")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        // The form now lives on its own page; here we only bring it into view.
        if (view === "register") {
            document
                .getElementById("registration-form")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (view === "intro" && registrationRef.current) registrationRef.current.scrollToForm();
        else navigate(getEventUrl(event.key, "intro", { hash: "#registration-form" }));
    };
    const state =
        now >= eventTimestamp(event.endAt)
            ? "ended"
            : now >= eventTimestamp(event.startAt)
              ? "live"
              : "upcoming";
    const open = state !== "ended" && registrationOpen(template, now);
    const label = registration
        ? "aix.register.registered"
        : registrationError
          ? "aix.register.retry"
          : authLoading || registrationLoading
            ? "aix.loading"
            : open
              ? "aix.register.title"
              : "aix.register.closed";
    return (
        <section
            ref={workspaceRef}
            className="hx-workspace hx-edition-one"
            data-event={event.key}
            data-view={view}
        >
            <SEO title={`${event.title} | 浙客松`} description={event.description} />
            <a className="hx-skip" href="#hx-event-content">
                {t("eventWorkspace.skip")}
            </a>
            <header className="hx-eventbar">
                <HackathonEventPicker
                    events={schedule.events}
                    value={event.key}
                    now={now}
                    onChange={(key) =>
                        navigate(
                            getEventUrl(key, ["forums", "partners"].includes(view) ? "intro" : view)
                        )
                    }
                />
                <nav className="hx-nav" aria-label={t("aix.navigation")}>
                    {getEventViews(event.key)
                        .filter(
                            (item) =>
                                !(
                                    event.key === "zhekesong-ai-x-2026" &&
                                    (item === "media" ||
                                        (item === "results" &&
                                            template.navigation?.resultsVisible === false))
                                )
                        )
                        .map((item) => (
                            <Link
                                key={item}
                                to={getEventUrl(event.key, item)}
                                aria-current={
                                    (view === "register" ? "intro" : view) === item
                                        ? "page"
                                        : undefined
                                }
                            >
                                {t(
                                    event.key === "zhekesong-ai-x-2026"
                                        ? `aix.workspaceTabs.${item}`
                                        : `eventWorkspace.tabs.${item}`
                                )}
                                {event.key === "zhekesong-ai-x-2026" &&
                                    item === "challenges" &&
                                    now < eventTimestamp(event.startAt) && (
                                        <small>{t("aix.official.challengeSoon")}</small>
                                    )}
                            </Link>
                        ))}
                </nav>
                <div className="hx-event-actions">
                    <button
                        type="button"
                        className="hx-outline"
                        aria-haspopup="dialog"
                        onClick={() => setLotteryOpen(true)}
                    >
                        <Gift size={17} aria-hidden="true" />
                        {t("lottery.event_entry")}
                    </button>
                    <button
                        className="hx-primary"
                        disabled={
                            view === "forums"
                                ? !forumConfig.sessions.some(
                                      (s) =>
                                          s.key === "entrepreneurship" &&
                                          now >= Date.parse(forumConfig.registrationOpensAt) &&
                                          now < Date.parse(s.startsAt)
                                  )
                                : authLoading ||
                                  registrationLoading ||
                                  (!registration && !open && !registrationError)
                        }
                        onClick={showRegistration}
                    >
                        {registration ? <Check size={17} /> : null}
                        {t(view === "forums" ? "aix.forumPage.signupTitle" : label)}
                        {open && !registration ? <ArrowUpRight size={17} /> : null}
                    </button>
                </div>
                <span className="hx-event-status">{t(`aix.state.${state}`)}</span>
            </header>
            {lotteryOpen && (
                <LotteryModal
                    eventKey={event.key}
                    eventTitle={event.title}
                    onClose={() => setLotteryOpen(false)}
                    onLogin={() => {
                        resumeLottery.current = true;
                        setLotteryOpen(false);
                        window.dispatchEvent(new Event("open-auth-modal"));
                    }}
                />
            )}
            <div
                id="hx-event-content"
                className={`hx-page ${!["intro", "media", "forums", "partners"].includes(view) ? "hx-interior" : ""}`}
                data-view={view}
                key={`${event.key}:${view}`}
            >
                {!["intro", "media", "forums", "partners"].includes(view) && (
                    <div className="hx-page-scenery" aria-hidden="true">
                        <div className="hx-event-backdrop" />
                        <div className="hx-event-grid" />
                    </div>
                )}
                <HackathonEventContent
                    template={template}
                    view={view}
                    registrationOpen={open}
                    now={now}
                    live={state === "live"}
                    registrationRef={registrationRef}
                    registrationState={{
                        user,
                        loading: authLoading || registrationLoading,
                        error: registrationError,
                        registration,
                        onRetry: () => setRetry((value) => value + 1),
                        onLogin: () => window.dispatchEvent(new Event("open-auth-modal")),
                        onRegistered: (value) => {
                            if (
                                registrationOwner.current.userId !== user?.id ||
                                registrationOwner.current.eventKey !== event.key
                            )
                                return;
                            setRegistration(value);
                            setRegistrationError(false);
                        },
                    }}
                />
            </div>
        </section>
    );
}
