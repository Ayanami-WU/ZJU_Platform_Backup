import AiXTrackPurpose from "./AiXTrackPurpose";
import AiXRewards from "./AiXRewards";
import AiXIncubation from "./AiXIncubation";
import { useState } from "react";
import { Pause, Play, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXOverview.css";
import "./AiXTrackSchedule.css";

export default function AiXOverview({ state }) {
    const { t } = useTranslation();
    const [paused, setPaused] = useState(false);
    const copy = t("aix.pages", { returnObjects: true });
    const trackBadges = t("aix.trackBadges", { returnObjects: true });
    return (
        <div className="aix-paged-content">
            <section
                id="aix-overview"
                className="aix-page"
                data-aix-chapter
                aria-labelledby="aix-main-title"
            >
                <div className="aix-page-body aix-cover">
                    <div className="aix-cover-copy">
                        <div className="aix-cover-eyebrow">
                            <span>2026</span>
                            <span>{t(`aix.state.${state}`)}</span>
                        </div>
                        <h1 id="aix-main-title">
                            <span>{copy.coverTitle[0]}</span>
                            <strong>{copy.coverTitle[1]}</strong>
                        </h1>
                        <div className="aix-cover-prize">
                            <strong>{t("aix.official.prizeValue")}</strong>
                            <span>{t("aix.official.totalPrize")}</span>
                        </div>
                    </div>
                    <div className="aix-cover-art" data-motion-paused={paused}>
                        <img
                            src="/images/hackathon/ai-x/pixel-x.svg?v=clean-20261009"
                            alt=""
                            width="640"
                            height="640"
                            fetchpriority="high"
                        />
                        <button
                            type="button"
                            onClick={() => setPaused(!paused)}
                            aria-label={t(
                                paused ? "aix.landing.resumeMotion" : "aix.landing.pauseMotion"
                            )}
                        >
                            {paused ? <Play size={16} /> : <Pause size={16} />}
                        </button>
                    </div>
                    <div className="aix-cover-schedule">
                        {copy.tracks.map((track) => (
                            <article className="aix-timeline-panel" key={track.id}>
                                <header>
                                    <h3>{track.title}</h3>
                                    <span>{track.mode}</span>
                                </header>
                                <ol>
                                    {track.stages.map((stage, index) => (
                                        <li
                                            key={index}
                                            className={stage.date ? "" : "aix-stage-empty"}
                                            aria-hidden={!stage.date || undefined}
                                        >
                                            {stage.date && (
                                                <>
                                                    <time>{stage.date}</time>
                                                    <strong>{stage.title}</strong>
                                                    {stage.note && <small>{stage.note}</small>}
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </article>
                        ))}
                    </div>
                </div>
            </section>
            <section
                id="aix-tracks"
                className="aix-page"
                data-aix-chapter
                aria-labelledby="aix-format-title"
            >
                <div className="aix-page-body">
                    <header className="aix-page-heading">
                        <span>02</span>
                        <h2 id="aix-format-title">{copy.format}</h2>
                    </header>
                    <div className="aix-track-rules">
                        {copy.tracks.map((track) => (
                            <article className="aix-rule-panel" key={track.id}>
                                <header className="aix-track-card-heading">
                                    <h3>
                                        {track.title}
                                        <AiXTrackPurpose track={track.id} />
                                    </h3>
                                    <div className="aix-track-badges">
                                        {(Array.isArray(trackBadges?.[track.id])
                                            ? trackBadges[track.id]
                                            : String(track.mode || "")
                                                  .split(/\s*·\s*/)
                                                  .filter(Boolean)
                                        ).map((badge) => (
                                            <span key={badge}>{badge}</span>
                                        ))}
                                    </div>
                                </header>
                                <ol className="aix-track-stage-list">
                                    {track.schedule.map((step, index) => (
                                        <li key={index}>
                                            <div className="aix-track-stage-label">
                                                <span>{String(index + 1).padStart(2, "0")}</span>
                                                <h4>{step.label || step.title}</h4>
                                            </div>
                                            <div className="aix-track-stage-details">
                                                <div className="aix-track-stage-date">
                                                    <time>{step.date}</time>
                                                    {step.time && <span>{step.time}</span>}
                                                </div>
                                                <p className="aix-track-stage-place">
                                                    <MapPin size={16} aria-hidden="true" />
                                                    <span>
                                                        {(
                                                            step.place ||
                                                            t("aix.trackScheduleOnline", {
                                                                defaultValue: "线上",
                                                            })
                                                        )
                                                            .split(
                                                                /(\d+[–-]\d+|[A-Z]\s*座\s*\d+\s*楼)/g
                                                            )
                                                            .map((part, partIndex) =>
                                                                partIndex % 2 ? (
                                                                    <span
                                                                        className="aix-track-location-unit"
                                                                        key={partIndex}
                                                                    >
                                                                        {part}
                                                                    </span>
                                                                ) : (
                                                                    part
                                                                )
                                                            )}
                                                        {step.attendance && (
                                                            <span className="aix-track-attendance">
                                                                {step.attendance}
                                                            </span>
                                                        )}
                                                    </span>
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            </article>
                        ))}
                    </div>
                </div>
            </section>
            <section
                id="aix-rewards"
                className="aix-page"
                data-aix-chapter
                aria-labelledby="aix-reward-title"
            >
                <div className="aix-page-body">
                    <header className="aix-page-heading aix-rewards-heading">
                        <span>03</span>
                        <h2 id="aix-reward-title">{copy.rewardsTitle}</h2>
                        <p className="aix-rewards-pool">
                            <small>{t("aix.official.totalPrize")}</small>
                            <strong>{t("aix.official.prizeValue")}</strong>
                        </p>
                    </header>
                    <AiXRewards rewards={copy.rewards} />
                </div>
            </section>
            <AiXIncubation />
        </div>
    );
}
