import { useTranslation } from "react-i18next";

export default function AiXRecommendedScenes() {
    const { t } = useTranslation();
    const content = t("aix.challengeWorkspace.recommendations", { returnObjects: true });

    return (
        <div className="aix-recommended-scenes">
            <div className="aix-scenes-overview">
                <header className="aix-scenes-topic">
                    <h3>{content.topicType}</h3>
                    <p className="aix-scenes-scope">{content.scope}</p>
                </header>
                <dl className="aix-scenes-facts">
                    <div>
                        <dt>{content.goalTitle}</dt>
                        <dd>{content.goal}</dd>
                    </div>
                    <div>
                        <dt>{content.formatsTitle}</dt>
                        <dd>
                            <ul className="aix-scenes-formats">
                                {(content.formats || []).map((format) => (
                                    <li key={format}>{format}</li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                    <div>
                        <dt>
                            {content.evidenceTitle}
                            <small>{content.evidenceHint}</small>
                        </dt>
                        <dd>
                            <ul className="aix-scenes-evidence">
                                {(content.evidence || []).map((item) => (
                                    <li key={item}>{item}</li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                </dl>
                <section
                    className="aix-scenes-thinking"
                    aria-labelledby="aix-scenes-thinking-title"
                >
                    <h3 id="aix-scenes-thinking-title">{content.thinkingTitle}</h3>
                    <ol className="aix-scenes-steps">
                        {(content.thinkingSteps || []).map((step) => (
                            <li key={step.title}>
                                <strong>{step.title}</strong>
                                <p>{step.question}</p>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
            <div className="aix-scenes-grid">
                {content.scenes.map((scene, index) => (
                    <article key={scene.id} className="aix-recommended-scene">
                        <header className="aix-scene-heading">
                            <span className="aix-scene-number">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <h3>{scene.title}</h3>
                        </header>
                        <dl>
                            <div>
                                <dt>{content.labels.audience}</dt>
                                <dd>{scene.audience}</dd>
                            </div>
                            <div>
                                <dt>{content.labels.pain}</dt>
                                <dd>{scene.pain}</dd>
                            </div>
                            <div>
                                <dt>{content.labels.example}</dt>
                                <dd>{scene.example}</dd>
                            </div>
                        </dl>
                        {scene.resource && (
                            <details className="aix-scene-resource">
                                <summary>{scene.resource.title}</summary>
                                <p>{scene.resource.description}</p>
                            </details>
                        )}
                    </article>
                ))}
            </div>
        </div>
    );
}
