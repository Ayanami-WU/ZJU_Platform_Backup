import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./AiXForumOverview.css";

export default function AiXForumOverview() {
    const { t } = useTranslation();
    const copy = t("aix.pages.forumOverview", { returnObjects: true });
    return (
        <section id="aix-forums" aria-label={copy.title}>
            <div>
                <div className="aix-forum-panels">
                    {copy.sessions.map((forum) => (
                        <article className="aix-forum-panel" data-forum={forum.id} key={forum.id}>
                            <header className="aix-forum-panel-heading">
                                <h3>{forum.title}</h3>
                                <p>{forum.theme}</p>
                            </header>
                            <div className="aix-forum-place">
                                <time>{forum.date}</time>
                                <p>{forum.location}</p>
                            </div>

                            <div className="aix-forum-lineup">
                                <ul className="aix-forum-guests">
                                    {forum.guests.map((guest) => (
                                        <li key={guest.id}>
                                            <div
                                                className="aix-guest-portrait"
                                                data-empty={!guest.photo || undefined}
                                            >
                                                {guest.photo && (
                                                    <img
                                                        src={`/images/hackathon/ai-x/guests/${guest.id}.png`}
                                                        alt={guest.name}
                                                        loading="lazy"
                                                        width="240"
                                                        height="280"
                                                    />
                                                )}
                                            </div>
                                            <strong>{guest.name}</strong>
                                            <p>{guest.role}</p>
                                        </li>
                                    ))}
                                </ul>
                                {forum.teasers && (
                                    <div className="aix-forum-teasers">
                                        {forum.teasers.map((text) => (
                                            <span key={text}>{text}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="aix-forum-topics">
                                <h4>{copy.topicsLabel}</h4>
                                <ul>
                                    {forum.topics.map((topic) => (
                                        <li key={topic.speaker}>
                                            <span>{topic.title}</span>
                                            <small>
                                                {topic.speaker}
                                                {topic.host && <span>{topic.host}</span>}
                                            </small>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {forum.id === "entrepreneurship" && (
                                <footer>
                                    <Link
                                        className="aix-forum-signup-link"
                                        to={`/hackathon/2/forums?session=${forum.id}#forum-registration`}
                                    >
                                        {forum.signup}
                                        <ArrowUpRight size={18} aria-hidden="true" />
                                    </Link>
                                </footer>
                            )}
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}
