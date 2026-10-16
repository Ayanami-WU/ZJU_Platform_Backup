import { useTranslation } from "react-i18next";
import "./AiXIncubation.css";

export default function AiXIncubation() {
    const { t } = useTranslation();
    const copy = t("aix.incubation", { returnObjects: true });
    return (
        <section
            id="aix-incubation"
            className="aix-page"
            data-aix-chapter
            aria-labelledby="aix-incubation-title"
        >
            <div className="aix-page-body">
                <header className="aix-page-heading">
                    <span>04</span>
                    <h2 id="aix-incubation-title">{copy.title}</h2>
                </header>
                <p className="aix-incubation-intro">{copy.intro}</p>
                <div className="aix-incubation-providers">
                    {copy.providers.map((provider) => (
                        <article
                            key={provider.id}
                            className="aix-incubation-provider"
                            aria-labelledby={`aix-incubation-${provider.id}`}
                        >
                            <header>
                                <h3 id={`aix-incubation-${provider.id}`}>{provider.name}</h3>
                                <p>{provider.location}</p>
                            </header>
                            <dl>
                                {provider.benefits.map((benefit) => (
                                    <div key={benefit.title}>
                                        <dt>{benefit.title}</dt>
                                        <dd>{benefit.detail}</dd>
                                    </div>
                                ))}
                            </dl>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
