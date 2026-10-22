import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AiXSubmissionChannel({ track, stage }) {
    const { t } = useTranslation();
    const label = (key, options) => t(`aix.challengeWorkspace.${key}`, options);
    const channelLabel = (key, options) => t(`aix.refined.${key}`, options);

    const isTmall = track === "campus";
    if (stage === "final" && !isTmall) return null;
    if (isTmall) {
        return (
            <section
                className="aix-submission-channel is-tmall"
                aria-label={channelLabel("tmallChannelQrAlt")}
            >
                <figure className="aix-submission-channel-qr">
                    <img
                        src="/images/hackathon/ai-x/official/tmall-submission-qr.jpg"
                        alt={channelLabel("tmallChannelQrAlt")}
                        width="954"
                        height="752"
                    />
                </figure>
            </section>
        );
    }

    const fields =
        stage === "semifinal"
            ? ["projectName", "githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"]
            : ["projectName", "githubUrl", "modelscopeUrl", "bpFileId"];

    return (
        <section className={`aix-submission-channel ${isTmall ? "is-tmall" : "is-huawei"}`}>
            <div className="aix-submission-channel-copy">
                {!isTmall && (
                    <>
                        <div className="aix-submission-channel-heading">
                            <ExternalLink size={20} aria-hidden="true" />
                            <div>
                                <p className="aix-submission-channel-kicker">
                                    {channelLabel("channelsTitle")}
                                </p>
                                <h3>{channelLabel("huaweiChannelTitle")}</h3>
                            </div>
                        </div>
                        <p>{channelLabel("huaweiChannelDescription")}</p>
                    </>
                )}
                <ul>
                    {fields.map((field) => (
                        <li key={field}>
                            <span>
                                {label(
                                    field === "modelscopeUrl"
                                        ? "industry.projectUrlLabel"
                                        : `fields.${field}`
                                )}
                            </span>
                            <b>{channelLabel("requiredMark")}</b>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
