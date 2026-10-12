import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getEventUrl } from "../utils/hackathonRoute";
import HackathonRegistration from "./HackathonRegistration";
import HackathonOutcomeShowcase from "./HackathonOutcomeShowcase";
import FirstEditionChallenge from "./hackathon-event/FirstEditionChallenge";
import BeautyEventContent from "./hackathon-event/BeautyEventContent";

import Challenges from "./hackathon-event/Challenges";
import Media from "./hackathon-event/Media";
import Results from "./hackathon-event/Results";
import LotteryPage from "../features/lottery/LotteryPage";
import AiXForums from "./hackathon-event/AiXForums";
import AiXOverview from "./hackathon-event/AiXOverview";
import { eventTimestamp } from "../utils/hackathonAiX";
import Program from "./hackathon-event/Program";

// Preserve the original registration body; historical records remain in their original competition.
export default function HackathonEventContent({
    template,
    view,
    registrationOpen,
    now,
    live,
    registrationRef,
    registrationState,
}) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const switchView = (next, track) =>
        navigate(getEventUrl(template.event.key, next, { search: track ? `?track=${track}` : "" }));
    if (view === "forums") return <AiXForums now={now} registrationState={registrationState} />;
    if (view === "lottery")
        return <LotteryPage eventKey={template.event.key} eventTitle={template.event.title} />;
    const hasProgram = Boolean(template.event.program);
    if (template.event.key === "getui-beauty-2026")
        return <BeautyEventContent template={template} view={view} live={live} />;
    if (hasProgram && view === "challenges")
        return <Challenges template={template} now={now} registrationState={registrationState} />;
    if (hasProgram && view === "media") return <Media template={template} live={live} />;
    if (hasProgram && view === "results")
        return <Results template={template} now={now} switchView={switchView} />;
    if (view === "media") return <Media template={template} live={live} />;
    if (view === "results")
        return template.navigation?.resultsVisible === false ? (
            <div className="hx-content">
                <h1>{t("eventWorkspace.resultsPending")}</h1>
            </div>
        ) : (
            <HackathonOutcomeShowcase template={template} />
        );
    if (view === "challenges") return <FirstEditionChallenge template={template} />;
    return (
        <HackathonRegistration
            template={{ ...template, event: { ...template.event, registrationOpen } }}
            registrationRef={registrationRef}
            registrationState={registrationState}
            introductionContent={
                template.event.key === "zhekesong-ai-x-2026"
                    ? () => (
                          <AiXOverview
                              now={now}
                              state={
                                  now >= eventTimestamp(template.event.endAt)
                                      ? "ended"
                                      : live
                                        ? "live"
                                        : "upcoming"
                              }
                              switchView={switchView}
                          />
                      )
                    : undefined
            }
            programContent={
                hasProgram ? (
                    <Program template={template} now={now} switchView={switchView} />
                ) : undefined
            }
        />
    );
}
