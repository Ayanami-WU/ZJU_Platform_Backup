import { useState } from "react";
import { Pause, Play, Trophy, Medal, Gift, MapPin } from "lucide-react";
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
                            <strong>¥27,500</strong>
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
                                    <h3>{track.title}</h3>
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
                    <header className="aix-page-heading">
                        <span>03</span>
                        <h2 id="aix-reward-title">{copy.rewardsTitle}</h2>
                    </header>
                    <div className="aix-prize-panels">
                        {copy.rewards.map((reward) => (
                            <article
                                key={reward.title}
                                className="aix-prize-panel"
                                data-reward={reward.kind}
                            >
                                <header className="aix-prize-heading">
                                    {reward.kind === "gifts" ? (
                                        <Gift size={24} aria-hidden="true" />
                                    ) : (
                                        <Trophy size={24} aria-hidden="true" />
                                    )}
                                    <h3>{reward.title}</h3>
                                </header>
                                <div className="aix-prize-total">
                                    <span>{reward.totalLabel}</span>
                                    <strong className="aix-prize-number">{reward.value}</strong>
                                </div>
                                <p>{reward.note}</p>
                                <dl>
                                    {reward.rows.map((row) => (
                                        <div key={row.label}>
                                            <dt>
                                                {reward.kind !== "gifts" && (
                                                    <Medal
                                                        size={23}
                                                        strokeWidth={1.5}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                <strong>{row.label}</strong>
                                                {row.count && <span>{row.count}</span>}
                                            </dt>
                                            <dd>
                                                {row.products && (
                                                    <div
                                                        className="aix-prize-products"
                                                        data-pair={
                                                            row.products.length === 2 || undefined
                                                        }
                                                    >
                                                        {row.products.map((product) => (
                                                            <div key={product.name}>
                                                                <strong className="aix-prize-product-name">
                                                                    {product.name}
                                                                </strong>
                                                                <span className="aix-prize-product-amounts">
                                                                    <strong className="aix-prize-value">
                                                                        {product.value}
                                                                    </strong>
                                                                    <strong className="aix-prize-cash">
                                                                        + {product.cash}
                                                                    </strong>
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                                {row.lines.map((line) => (
                                                    <span key={line}>{line}</span>
                                                ))}
                                                {row.cash && (
                                                    <strong className="aix-prize-cash">
                                                        {row.cash}
                                                    </strong>
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                <footer aria-hidden={!reward.footer || undefined}>
                                    {reward.footer}
                                </footer>
                            </article>
                        ))}
                    </div>
                </div>
            </section>
        </div>
    );
}
