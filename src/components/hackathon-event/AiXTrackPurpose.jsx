import { useTranslation } from "react-i18next";
import "./AiXTrackPurpose.css";

export default function AiXTrackPurpose({ track }) {
    const { t } = useTranslation();
    if (!["campus", "industry"].includes(track)) return null;
    return <span className="aix-track-purpose">{t(`aix.trackPurpose.${track}`)}</span>;
}
