import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { AIX_EVENT_KEY } from "../../utils/hackathonAiX";
import { getEventUrl } from "../../utils/hackathonRoute";
import "./AiXQualificationNotice.css";

export default function AiXQualificationNotice({ eventKey, user }) {
    const { t, i18n } = useTranslation();
    const text = (key, options) => t(`aix.qualificationNotice.${key}`, options);
    const navigate = useNavigate();
    const dialog = useRef(null);
    const [snapshot, setSnapshot] = useState(null);
    const [dismissed, setDismissed] = useState("");
    const [reopen, setReopen] = useState(false);
    const userId = user?.id;
    useEffect(() => {
        if (eventKey !== AIX_EVENT_KEY || !userId) return;
        const controller = new AbortController();
        let latestRequest = 0;
        const read = () => {
            if (document.hidden) return;
            const request = ++latestRequest;
            api.get("/hackathon/submissions", {
                params: { event: eventKey },
                signal: controller.signal,
            })
                .then(({ data }) => {
                    if (!controller.signal.aborted && request === latestRequest)
                        setSnapshot({ userId, eventKey, data });
                })
                .catch(() => {
                    // Never show a qualification from a failed or stale account request.
                    if (!controller.signal.aborted && request === latestRequest) setSnapshot(null);
                });
        };
        read();
        const timer = window.setInterval(read, 60000);
        window.addEventListener("focus", read);
        return () => {
            controller.abort();
            window.clearInterval(timer);
            window.removeEventListener("focus", read);
        };
    }, [eventKey, userId]);
    const data =
        userId && snapshot?.userId === userId && snapshot?.eventKey === eventKey
            ? snapshot.data
            : null;
    const qualification = data?.tracks?.industry;
    const qualified =
        eventKey === AIX_EVENT_KEY &&
        qualification?.registered === true &&
        qualification?.semifinalQualified === true;
    const noticeKey = qualified
        ? `aix-semifinal-notice:${eventKey}:${userId}:${qualification.qualificationUpdatedAt || "qualified"}`
        : "";
    let acknowledged = false;
    try {
        acknowledged = Boolean(noticeKey && localStorage.getItem(noticeKey));
    } catch {
        /* In-memory dismissal remains available. */
    }
    const visible = qualified && (reopen || (dismissed !== noticeKey && !acknowledged));
    useEffect(() => {
        const element = dialog.current;
        if (visible && element && !element.open) element.showModal();
        if (!visible && element?.open) element.close();
    }, [visible]);
    useEffect(() => {
        if (!visible) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previous;
        };
    }, [visible]);
    const dismiss = () => {
        setDismissed(noticeKey);
        setReopen(false);
        try {
            localStorage.setItem(noticeKey, "1");
        } catch {
            /* Storage may be unavailable. */
        }
    };
    const deadline = qualification?.stages?.semifinal?.closesAt;
    const deadlineText =
        deadline && Number.isFinite(Date.parse(deadline))
            ? new Intl.DateTimeFormat(i18n.language.startsWith("en") ? "en-GB" : "zh-CN", {
                  timeZone: "Asia/Shanghai",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
              }).format(new Date(deadline))
            : null;
    if (!qualified) return null;
    return (
        <>
            <button type="button" className="aix-qualified-reopen" onClick={() => setReopen(true)}>
                {text("badge")}
                <ArrowUpRight size={16} aria-hidden="true" />
            </button>
            <dialog
                ref={dialog}
                lang={i18n.resolvedLanguage || i18n.language}
                className="aix-qualification-dialog"
                aria-labelledby="aix-qualification-title"
                aria-describedby="aix-qualification-description"
                onCancel={(event) => {
                    event.preventDefault();
                    dismiss();
                }}
            >
                <div className="aix-qualification-content">
                    <button
                        type="button"
                        className="aix-qualification-close"
                        onClick={dismiss}
                        aria-label={text("close")}
                    >
                        <X size={24} />
                    </button>
                    <header className="aix-qualification-kicker">
                        <span>02</span>
                        <p>{text("track")}</p>
                    </header>
                    <div className="aix-qualification-hero">
                        <div className="aix-qualification-copy">
                            <h2 id="aix-qualification-title">
                                <span>{text("title").split("\n")[0]}</span>
                                <strong>{text("title").split("\n").slice(1).join(" ")}</strong>
                            </h2>
                            <p id="aix-qualification-description">{text("description")}</p>
                        </div>
                        <div className="aix-qualification-art" aria-hidden="true">
                            <img
                                src="/images/hackathon/ai-x/pixel-x.svg?v=clean-20261009"
                                alt=""
                                width="640"
                                height="640"
                            />
                        </div>
                    </div>
                    <dl className="aix-qualification-details">
                        <div>
                            <dt>{text("teamLabel")}</dt>
                            <dd>{qualification.teamName || text("individual")}</dd>
                        </div>
                        {deadlineText && (
                            <div>
                                <dt>{text("deadlineLabel")}</dt>
                                <dd>
                                    {deadlineText}
                                    <small>{text("timezone")}</small>
                                </dd>
                            </div>
                        )}
                    </dl>
                    <footer className="aix-qualification-actions">
                        <button
                            type="button"
                            className="hx-primary aix-qualification-primary"
                            onClick={() => {
                                dismiss();
                                navigate(
                                    `${getEventUrl(eventKey, "challenges")}?track=industry&stage=semifinal`
                                );
                            }}
                        >
                            {text("continue")}
                            <ArrowUpRight size={22} aria-hidden="true" />
                        </button>
                        <button type="button" className="aix-qualification-later" onClick={dismiss}>
                            {text("later")}
                        </button>
                    </footer>
                </div>
            </dialog>
        </>
    );
}
