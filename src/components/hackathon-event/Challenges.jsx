import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight, CalendarDays, FileText, MapPin } from "lucide-react";
import {
    AIX_EVENT_KEY,
    safeWebUrl,
    eventTimestamp,
    registrationOpen,
} from "../../utils/hackathonAiX";
import { getEventUrl } from "../../utils/hackathonRoute";
import api from "../../services/api";
import AiXStageSubmission from "./AiXStageSubmission";
import AiXRecommendedScenes from "./AiXRecommendedScenes";
import "./AiXChallenges.css";
import "./AiXRegistrationPreview.css";

const tracks = ["industry", "campus"];
const stages = ["initial", "semifinal", "final"];

export default function Challenges({ template, now, registrationState = {} }) {
    const { t, i18n } = useTranslation();
    const label = (key, options) => t(`aix.challengeWorkspace.${key}`, options);
    const location = useLocation();
    const navigate = useNavigate();
    const { user, loading: authLoading, onLogin } = registrationState;
    const [snapshot, setSnapshot] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [mutating, setMutating] = useState(false);
    const drafts = useRef({});
    const boundaryRefresh = useRef(null);
    const owner = user?.id || null;
    const ownerRef = useRef(owner);
    ownerRef.current = owner;
    const eventKey = template.event.key;
    const data = snapshot?.owner === owner && owner ? snapshot.data : null;
    const serverTime =
        typeof data?.serverNow === "number" ? data.serverNow : Date.parse(data?.serverNow);
    const referenceNow = Number.isFinite(serverTime)
        ? serverTime + Math.max(0, now - snapshot.receivedAt)
        : now;
    const program = template.event.program || {};
    const params = new URLSearchParams(location.search);
    const track = tracks.includes(params.get("track")) ? params.get("track") : "industry";
    const publicStages = program.trackStages?.[track] || program.stages || [];
    const windows = data?.tracks?.[track]?.stages;
    const current =
        stages.find((id) => {
            const item = windows?.[id] || publicStages.find((value) => value.id === id);
            return (
                item &&
                referenceNow >= eventTimestamp(item.opensAt) &&
                referenceNow < eventTimestamp(item.closesAt)
            );
        }) ||
        stages
            .filter((id) => {
                const item = windows?.[id] || publicStages.find((value) => value.id === id);
                return item && referenceNow >= eventTimestamp(item.opensAt);
            })
            .at(-1) ||
        "initial";
    const stage = stages.includes(params.get("stage")) ? params.get("stage") : current;
    const publicWindow = publicStages.find((item) => item.id === stage);
    const remoteGate = windows?.[stage];
    const window = remoteGate || publicWindow;
    const temporalState =
        stage === "final"
            ? "presentation"
            : !window || referenceNow < eventTimestamp(window.opensAt)
              ? "upcoming"
              : referenceNow >= eventTimestamp(window.closesAt)
                ? "closed"
                : "open";
    const gate = remoteGate
        ? {
              ...remoteGate,
              state: temporalState,
              canSave: remoteGate.canSave && temporalState === "open",
              canSubmit: remoteGate.canSubmit && temporalState === "open",
              blockedReason:
                  remoteGate.blockedReason ||
                  (temporalState === "closed"
                      ? "closed"
                      : temporalState === "upcoming"
                        ? "not_open"
                        : null),
          }
        : { ...publicWindow, state: temporalState, canSave: false, canSubmit: false };
    const record = data?.submissions?.find((item) => item.track === track && item.stage === stage);
    const draftKey = `${owner || "anonymous"}:${track}:${stage}`;
    const challenges = (program.challenges || []).filter(
        (item) => item.published && item.track === track && item.stage === stage
    );
    const hasRecommendations = eventKey === AIX_EVENT_KEY && track === "campus";
    const signupOpen = registrationOpen(template, now);
    const formatDate = (value) => {
        const time = eventTimestamp(value);
        return Number.isFinite(time)
            ? new Intl.DateTimeFormat(i18n.resolvedLanguage?.startsWith("en") ? "en-GB" : "zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                  timeZone: "Asia/Shanghai",
              }).format(time)
            : "—";
    };
    const formatWindow = (opensAt, closesAt) => {
        const start = eventTimestamp(opensAt),
            end = eventTimestamp(closesAt);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
        const formatter = new Intl.DateTimeFormat("en-GB", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Shanghai",
        });
        const parts = (value) =>
            Object.fromEntries(
                formatter.formatToParts(value).map((part) => [part.type, part.value])
            );
        const first = parts(start);
        let last = parts(end);
        const midnight = last.hour === "00" && last.minute === "00";
        if (midnight) last = { ...parts(end - 86400000), hour: "24", minute: "00" };
        const date = (value) => `${value.month}.${value.day}`;
        const time = (value) => `${value.hour}:${value.minute}`;
        return `${date(first)} ${time(first)} — ${date(first) === date(last) ? "" : `${date(last)} `}${time(last)}`;
    };
    const read = useCallback(
        async (signal) => {
            const response = await api.get("/hackathon/submissions", {
                params: { event: eventKey },
                signal,
            });
            if (ownerRef.current === owner)
                setSnapshot({ owner, data: response.data, receivedAt: Date.now() });
            return response.data;
        },
        [eventKey, owner]
    );
    useEffect(() => {
        if (!owner) return;
        const controller = new AbortController();
        setLoading(true);
        setLoadError(false);
        read(controller.signal)
            .catch((error) => {
                if (error.code !== "ERR_CANCELED") setLoadError(true);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [owner, read, retry]);
    useEffect(() => {
        drafts.current = {};
        boundaryRefresh.current = null;
    }, [owner]);
    useEffect(() => {
        if (!owner || !remoteGate || stage === "final" || remoteGate.state === temporalState)
            return;
        const key = `${owner}:${track}:${stage}:${remoteGate.state}:${temporalState}`;
        if (boundaryRefresh.current === key) return;
        boundaryRefresh.current = key;
        read().catch(() => setLoadError(true));
    }, [owner, track, stage, remoteGate, temporalState, read]);
    const loaded = Boolean(data);
    useEffect(() => {
        if (location.hash !== "#submission") return;
        const frame = requestAnimationFrame(() =>
            document.getElementById("submission")?.scrollIntoView({ block: "start" })
        );
        return () => cancelAnimationFrame(frame);
    }, [location.hash, loaded]);
    const select = (nextTrack, nextStage) => {
        const search = new URLSearchParams(location.search);
        search.set("track", nextTrack);
        search.set("stage", nextStage);
        navigate({ pathname: location.pathname, search: `?${search}` }, { replace: true });
    };
    const onRecord = (submission) => {
        if (ownerRef.current !== owner) return;
        setSnapshot((value) =>
            value?.owner !== owner
                ? value
                : {
                      ...value,
                      data: {
                          ...value.data,
                          submissions: [
                              ...value.data.submissions.filter(
                                  (item) =>
                                      item.track !== submission.track ||
                                      item.stage !== submission.stage
                              ),
                              submission,
                          ],
                      },
                  }
        );
    };
    const reason = !user
        ? "login"
        : loadError
          ? "loadFailed"
          : !data
            ? "loading"
            : gate.blockedReason || "ready";
    const accessNotice =
        user && ["not_registered", "not_qualified"].includes(reason) ? (
            <div className="aix-task-access" role="status">
                <p>{label(`blocked.${reason}`)}</p>
                {reason === "not_registered" && signupOpen && (
                    <Link to={getEventUrl(eventKey, "intro", { hash: "#registration-form" })}>
                        {label("register")}
                        <ArrowUpRight size={16} />
                    </Link>
                )}
            </div>
        ) : null;
    return (
        <div className="aix-challenges aix-task-workspace">
            <header className="aix-task-heading">
                <h1>{label("title")}</h1>
                <div className="aix-task-track-tabs" role="tablist" aria-label={label("tracks")}>
                    {tracks.map((id) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            disabled={mutating}
                            id={`task-track-${id}`}
                            aria-selected={track === id}
                            aria-controls="aix-task-panel"
                            onClick={() => select(id, stage)}
                        >
                            {label(`trackLabels.${id}`)}
                        </button>
                    ))}
                </div>
            </header>
            <div className="aix-task-selectors">
                <div className="aix-task-stage-tabs" role="tablist" aria-label={label("stages")}>
                    {stages.map((id, index) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            disabled={mutating}
                            id={`task-stage-${id}`}
                            aria-selected={stage === id}
                            aria-controls="aix-task-panel"
                            onClick={() => select(track, id)}
                        >
                            <span>0{index + 1}</span>
                            {t(`aix.stages.${id}.title`)}
                        </button>
                    ))}
                </div>
            </div>
            <div
                role="tabpanel"
                id="aix-task-panel"
                aria-labelledby={`task-track-${track} task-stage-${stage}`}
            >
                <section className="aix-task-window" aria-label={label("roundRequirements")}>
                    <dl className="aix-task-requirements">
                        <div>
                            <dt>
                                <CalendarDays size={17} aria-hidden="true" />
                                <span className="sr-only">{label("timeLabel")}</span>
                            </dt>
                            <dd>
                                {window ? formatWindow(window.opensAt, window.closesAt) : "—"}
                                {i18n.resolvedLanguage?.startsWith("en") && (
                                    <small>{label("timezone")}</small>
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt>
                                <MapPin size={17} aria-hidden="true" />
                                <span className="sr-only">{label("locationLabel")}</span>
                            </dt>
                            <dd>{label(`locations.${stage === "initial" ? track : stage}`)}</dd>
                        </div>
                    </dl>
                    <span className={`aix-task-state is-${temporalState}`}>
                        {label(`states.${temporalState}`)}
                    </span>
                </section>
                {stage === "final" ? (
                    <section className="aix-task-final">
                        <div>
                            <h2>{label("finalTitle")}</h2>
                            <p>{label("finalDescription")}</p>
                        </div>
                    </section>
                ) : (
                    <div className="aix-task-columns">
                        <section className="aix-task-brief" aria-labelledby="aix-task-brief-title">
                            <header className="aix-task-panel-heading">
                                <h2 id="aix-task-brief-title">
                                    <span className="aix-task-number" aria-hidden="true">
                                        01
                                    </span>
                                    {label(hasRecommendations ? "recommendations.title" : "brief")}
                                </h2>
                            </header>
                            {hasRecommendations && <AiXRecommendedScenes />}
                            {track === "campus" && !hasRecommendations && challenges.length > 0 && (
                                <p className="aix-task-muted">{label("selfDefined")}</p>
                            )}
                            {challenges.map((item) => (
                                <article key={item.id} className="aix-task-challenge">
                                    <h3>{item.title}</h3>
                                    <p>{item.description}</p>
                                    {safeWebUrl(item.briefUrl) && (
                                        <a
                                            href={safeWebUrl(item.briefUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <FileText size={17} />
                                            {t("aix.readBrief")}
                                            <ArrowUpRight size={16} />
                                        </a>
                                    )}
                                    {safeWebUrl(item.submissionUrl) && temporalState === "open" && (
                                        <a
                                            href={safeWebUrl(item.submissionUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            {t("aix.refined.specificSubmission")}
                                            <ArrowUpRight size={16} />
                                        </a>
                                    )}
                                </article>
                            ))}
                            {!challenges.length && !hasRecommendations && (
                                <div className="aix-task-empty">
                                    <FileText size={24} />
                                    <p>
                                        {label(
                                            track === "campus" ? "campusPending" : "industryPending"
                                        )}
                                    </p>
                                </div>
                            )}
                        </section>
                        {(!user || data) && (
                            <AiXStageSubmission
                                key={draftKey}
                                eventKey={eventKey}
                                track={track}
                                stage={stage}
                                gate={gate}
                                record={record}
                                onBusyChange={setMutating}
                                files={data?.files || []}
                                legacyRepositories={data?.legacyRepositories}
                                onFile={(file) => {
                                    if (ownerRef.current !== owner) return;
                                    setSnapshot((value) =>
                                        value?.owner !== owner
                                            ? value
                                            : {
                                                  ...value,
                                                  data: {
                                                      ...value.data,
                                                      files: [
                                                          ...(value.data.files || []).filter(
                                                              (item) => item.id !== file.id
                                                          ),
                                                          file,
                                                      ],
                                                  },
                                              }
                                    );
                                }}
                                user={user}
                                loading={authLoading || loading}
                                accessNotice={accessNotice}
                                onLogin={onLogin}
                                cachedDraft={drafts.current[draftKey]}
                                onDraft={(value) => {
                                    if (ownerRef.current === owner)
                                        drafts.current[draftKey] = value;
                                }}
                                onRecord={onRecord}
                                onReload={read}
                                formatDate={formatDate}
                            />
                        )}
                        {user && !data && (
                            <section className="aix-task-submission">
                                <h2>
                                    <span className="aix-task-number" aria-hidden="true">
                                        02
                                    </span>
                                    {label("mySubmission")}
                                </h2>
                                <p role="status">
                                    {label(loadError ? "blocked.loadFailed" : "blocked.loading")}
                                </p>
                                {loadError && (
                                    <button
                                        type="button"
                                        className="aix-secondary"
                                        onClick={() => setRetry((value) => value + 1)}
                                    >
                                        {t("aix.retry")}
                                    </button>
                                )}
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
