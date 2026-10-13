import AiXTrackPurpose from "./AiXTrackPurpose";
import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXTrackRegistrationSummary.css";

export default function AiXTrackRegistrationSummary({ track }) {
    const { t } = useTranslation();
    const tracks = t("aix.pages.tracks", { returnObjects: true });
    const selected = Array.isArray(tracks) ? tracks.find((item) => item.id === track) : null;
    const badges = t(`aix.trackBadges.${track}`, { returnObjects: true });
    if (!selected) return null;
    const trackBadges = Array.isArray(badges)
        ? badges
        : String(selected.mode || "")
              .split(/\s*·\s*/)
              .filter(Boolean);
    return (
        <aside
            className="aix-track-registration-summary"
            aria-label={t("aix.register.trackSummary.label")}
            data-track={track}
        >
            <header className="aix-track-summary-heading">
                <h2>
                    {selected.title}
                    <AiXTrackPurpose track={track} />
                </h2>
                <div className="aix-track-summary-tags">
                    {trackBadges.map((badge) => (
                        <span key={badge}>{badge}</span>
                    ))}
                </div>
            </header>
            <ol className="aix-track-summary-stages">
                {selected.schedule.map((step, index) => (
                    <li key={`${track}-${index}`}>
                        <div className="aix-track-summary-stage-label">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <h3>{step.label || step.title}</h3>
                        </div>
                        <div className="aix-track-summary-stage-details">
                            <p className="aix-track-summary-stage-time">
                                <time>{step.date}</time>
                                {step.time && <span>{step.time}</span>}
                            </p>
                            <p className="aix-track-summary-stage-place">
                                <MapPin size={15} aria-hidden="true" />
                                <span>
                                    {(
                                        step.place ||
                                        t("aix.trackScheduleOnline", { defaultValue: "线上" })
                                    )
                                        .split(/(\d+[–-]\d+|[A-Z]\s*座\s*\d+\s*楼)/g)
                                        .map((part, partIndex) =>
                                            partIndex % 2 ? (
                                                <span
                                                    className="aix-track-summary-location-unit"
                                                    key={partIndex}
                                                >
                                                    {part}
                                                </span>
                                            ) : (
                                                part
                                            )
                                        )}
                                    {step.attendance && (
                                        <span className="aix-track-summary-attendance">
                                            {step.attendance}
                                        </span>
                                    )}
                                </span>
                            </p>
                        </div>
                    </li>
                ))}
            </ol>
        </aside>
    );
}
