import AiXOrganizers from "./AiXOrganizers";
import { useState } from "react";
import { Pause, Play, Trophy, Medal, Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
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
                                <header>
                                    <h3>{track.title}</h3>
                                    <p>{track.mode}</p>
                                </header>
                                <dl>
                                    {track.rules.map((rule) => (
                                        <div key={rule.label}>
                                            <dt>{rule.label}</dt>
                                            <dd>{rule.value}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </article>
                        ))}
                    </div>
                    <div className="aix-format-venues">
                        {copy.venues.map((venue) => (
                            <div key={venue.date}>
                                <time>{venue.date}</time>
                                <p>
                                    <strong>{venue.place}</strong>
                                    <span>{venue.address}</span>
                                </p>
                            </div>
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
                                                                <span>{product.name}</span>
                                                                <small>{product.value}</small>
                                                                <strong className="aix-prize-cash">
                                                                    {product.cash}
                                                                </strong>
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
            <section
                id="aix-partners-title"
                className="aix-page"
                data-aix-chapter
                aria-labelledby="aix-partners-heading"
            >
                <div className="aix-page-body">
                    <header className="aix-page-heading">
                        <span>04</span>
                        <h2 id="aix-partners-heading">{copy.partnersTitle}</h2>
                    </header>
                    <AiXOrganizers groups={copy.organizers} />
                    <AiXPartnerLogos />
                </div>
            </section>
        </div>
    );
}
