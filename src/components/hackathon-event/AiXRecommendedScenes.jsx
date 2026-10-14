import { useTranslation } from "react-i18next";

export default function AiXRecommendedScenes() {
    const { t } = useTranslation();
    const content = t("aix.challengeWorkspace.recommendations", { returnObjects: true });

    return (
        <div className="aix-recommended-scenes">
            <p className="aix-scenes-intro">{content.intro}</p>
            <p className="aix-scenes-format">{content.productForm}</p>
            <div className="aix-scenes-thinking">
                <h3>{content.thinkingTitle}</h3>
                <p>{content.thinking}</p>
            </div>
            {content.scenes.map((scene) => (
                <article key={scene.id} className="aix-recommended-scene">
                    <h3>{scene.title}</h3>
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
    );
}
