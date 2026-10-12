import { useTranslation } from "react-i18next";
import { ExternalLink, ChevronDown } from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSettings } from "../../context/SettingsContext";

export default function CompactLottery({ data, entry, error, onRefresh, onBack }) {
    const { t, i18n } = useTranslation();
    const date = (value) =>
        new Date(value).toLocaleString(i18n.language, {
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Shanghai",
        });
    const { uiMode } = useSettings();
    const mobile = useMediaQuery("(max-width: 767px)");
    return (
        <section
            className={`lottery-shell lottery-public lottery-event lottery-compact ${uiMode === "day" ? "lottery-day" : ""}`}
        >
            {onBack && (
                <button className="lottery-back" onClick={onBack}>
                    {t("lottery.event.back_campaigns")}
                </button>
            )}
            <div className="lottery-compact-intro">
                <p>
                    {t(
                        Number(data.min_likes) > 0
                            ? "lottery.compact.instruction"
                            : "lottery.compact.instruction_no_min",
                        { count: Number(data.min_likes) || 0 }
                    )}
                </p>
                {data.promotion_url && (
                    <a href={data.promotion_url} target="_blank" rel="noopener noreferrer">
                        {t("lottery.compact.open_post")}
                        <ExternalLink size={15} />
                    </a>
                )}
            </div>
            {error && (
                <div role="alert" className="lottery-alert">
                    {t(`lottery.errors.${error}`, {
                        defaultValue: t("lottery.errors.unavailable"),
                    })}
                    <button onClick={onRefresh}>{t("lottery.refresh")}</button>
                </div>
            )}
            <div className="lottery-compact-grid">
                <details className="lottery-panel lottery-compact-prizes" open={!mobile}>
                    <summary>
                        {t("lottery.prizes")}
                        <ChevronDown size={18} />
                    </summary>
                    <ul>
                        {(data.prizes || []).map((prize) => (
                            <li key={prize.id}>
                                <span>{prize.name}</span>
                                {!/(?:各\s*\d+\s*份|[：:]\s*\d+\s*份\s*$)/.test(prize.name) && (
                                    <small>
                                        {t("lottery.quantity", { count: prize.quantity })}
                                    </small>
                                )}
                            </li>
                        ))}
                    </ul>
                </details>
                {entry}
            </div>
            <footer className="lottery-compact-footer">
                <dl>
                    {["closes_at", "draws_at"].map((key) => (
                        <div key={key}>
                            <dt>{t(`lottery.compact.${key}`)}</dt>
                            <dd>{date(data[key])}</dd>
                        </div>
                    ))}
                </dl>
                <details className="lottery-compact-rules">
                    <summary>
                        {t("lottery.rules")}
                        <ChevronDown size={16} />
                    </summary>
                    <p className="lottery-prose">{data.rules}</p>
                    <p>{t("lottery.fairness")}</p>
                    {(data.event_key || Boolean(data.review_required)) && (
                        <p>{t("lottery.review_notice")}</p>
                    )}
                    <p>
                        {t("lottery.claims_until")}：{date(data.claims_until)}
                    </p>
                    {data.status === "drawn" && (
                        <details>
                            <summary>{t("lottery.results")}</summary>
                            <ul>
                                {(data.winners || []).map((winner) => (
                                    <li key={winner.ticket}>
                                        {winner.ticket} · {winner.prize_name}
                                    </li>
                                ))}
                            </ul>
                            <p>{t("lottery.hash_hint")}</p>
                            <code className="lottery-hash">{data.pool_hash}</code>
                        </details>
                    )}
                </details>
            </footer>
        </section>
    );
}
