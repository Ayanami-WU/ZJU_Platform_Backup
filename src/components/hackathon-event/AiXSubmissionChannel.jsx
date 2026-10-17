import { ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AiXSubmissionChannel({ track, stage }) {
    const { t } = useTranslation();
    const label = (key, options) => t(`aix.challengeWorkspace.${key}`, options);
    const channelLabel = (key, options) => t(`aix.refined.${key}`, options);

    if (stage === "final") return null;

    const isTmall = track === "campus";
    const fields = isTmall
        ? ["projectName", "githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"]
        : stage === "semifinal"
          ? ["projectName", "productHighlights", "githubUrl", "modelscopeUrl", "demoFileId"]
          : ["projectName", "productHighlights", "githubUrl", "modelscopeUrl"];

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
                            <span>{label(`fields.${field}`)}</span>
                            <b>{channelLabel("requiredMark")}</b>
                        </li>
                    ))}
                </ul>
            </div>
            {isTmall && (
                <figure className="aix-submission-channel-qr">
                    <img
                        src="/images/hackathon/ai-x/official/tmall-submission-qr.jpg"
                        alt={channelLabel("tmallChannelQrAlt")}
                        width="954"
                        height="752"
                    />
                </figure>
            )}
        </section>
    );
}
