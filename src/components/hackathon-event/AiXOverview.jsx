import { useState } from "react";
import { Pause, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import AiXForumOverview from "./AiXForumOverview";
import AiXPartnerLogos from "./AiXPartnerLogos";
import "./AiXOverview.css";

export default function AiXOverview({ state }) {
    const { t } = useTranslation();
    const [paused, setPaused] = useState(false);
    const copy = t("aix.pages", { returnObjects: true });
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
                            <strong>¥21,480</strong>
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
                    <div className="aix-cover-venues">
                        {copy.venues.map((venue) => (
                            <div key={venue.date}>
                                <time>{venue.date}</time>
                                <strong>{venue.title}</strong>
                                <span>{venue.place}</span>
                                <span>{venue.address}</span>
                            </div>
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
                    <div className="aix-track-timelines">
                        {copy.tracks.map((track) => (
                            <article className="aix-timeline-panel" key={track.id}>
                                <header>
                                    <h3>{track.title}</h3>
                                    <span>{track.mode}</span>
                                </header>
                                <p>{track.description}</p>
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
                            <article key={reward.title} className="aix-prize-panel">
                                <h3>{reward.title}</h3>
                                <strong className="aix-prize-number">{reward.value}</strong>
                                <p>{reward.note}</p>
                                <dl>
                                    {reward.rows.map((row) => (
                                        <div key={row.label}>
                                            <dt>{row.label}</dt>
                                            <dd>
                                                {row.lines.map((line) => (
                                                    <span key={line}>{line}</span>
                                                ))}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                {reward.footer && <footer>{reward.footer}</footer>}
                            </article>
                        ))}
                    </div>
                </div>
            </section>
            <AiXForumOverview />
            <section
                id="aix-partners-title"
                className="aix-page"
                data-aix-chapter
                aria-labelledby="aix-partners-heading"
            >
                <div className="aix-page-body">
                    <header className="aix-page-heading">
                        <span>05</span>
                        <h2 id="aix-partners-heading">{copy.partnersTitle}</h2>
                    </header>
                    <dl className="aix-organizer-rows">
                        {copy.organizers.map((row) => (
                            <div key={row.label}>
                                <dt>{row.label}</dt>
                                <dd>{row.names}</dd>
                            </div>
                        ))}
                    </dl>
                    <AiXPartnerLogos />
                </div>
            </section>
        </div>
    );
}
