import { CalendarDays, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXForumOverview.css";

function ForumGuest({ guest }) {
    return (
        <div className="aix-forum-speaker">
            <div
                className="aix-guest-portrait"
                data-empty={!guest.photo || undefined}
                data-photo={guest.photoUrl ? "original" : undefined}
            >
                {guest.photo && (
                    <img
                        src={guest.photoUrl || `/images/hackathon/ai-x/guests/${guest.id}.png`}
                        alt={guest.name}
                        loading="lazy"
                        width="240"
                        height="280"
                    />
                )}
            </div>
            <div>
                <strong>{guest.name}</strong>
                <p>{guest.role}</p>
            </div>
        </div>
    );
}

export default function AiXForumOverview() {
    const { t } = useTranslation();
    const copy = t("aix.pages.forumOverview", { returnObjects: true });
    return (
        <>
            {copy.sessions.map((forum, index) => {
                const otherGuests = forum.guests.filter((guest) =>
                    forum.invitedGuestIds?.includes(guest.id)
                );
                return (
                    <section
                        className="aix-page aix-forum-screen"
                        id={`forum-${forum.id}`}
                        data-forum={forum.id}
                        key={forum.id}
                    >
                        <div className="aix-page-body">
                            <div className="aix-forum-screen-top">
                                <header className="aix-forum-panel-heading">
                                    <div className="aix-page-heading">
                                        <span>{String(index + 1).padStart(2, "0")}</span>
                                        <h2>{forum.title}</h2>
                                    </div>
                                    <p>{forum.theme}</p>
                                </header>
                                <div className="aix-forum-place">
                                    <div>
                                        <CalendarDays size={22} aria-hidden="true" />
                                        <time>{forum.date}</time>
                                    </div>
                                    <div>
                                        <MapPin size={22} aria-hidden="true" />
                                        <p>{forum.location}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="aix-forum-agenda">
                                {forum.topics.map((topic) => (
                                    <article
                                        className="aix-forum-topic-row"
                                        data-roundtable={topic.guestIds.length > 1 || undefined}
                                        key={topic.speaker}
                                    >
                                        <div className="aix-forum-speakers">
                                            {topic.guestIds
                                                .map((id) =>
                                                    forum.guests.find((guest) => guest.id === id)
                                                )
                                                .filter(Boolean)
                                                .map((guest) => (
                                                    <ForumGuest key={guest.id} guest={guest} />
                                                ))}
                                        </div>
                                        <div className="aix-forum-topic-copy">
                                            <h3>{topic.title}</h3>
                                            {topic.host && <p>{topic.host}</p>}
                                        </div>
                                    </article>
                                ))}
                            </div>
                            <footer className="aix-forum-screen-footer">
                                {forum.teasers && (
                                    <div className="aix-forum-teasers">
                                        {forum.teasers.map((text) => (
                                            <span key={text}>{text}</span>
                                        ))}
                                    </div>
                                )}
                                {otherGuests.length > 0 && (
                                    <section className="aix-forum-invited">
                                        <h3>{copy.invitedLabel}</h3>
                                        <div className="aix-forum-other-guests">
                                            {otherGuests.map((guest) => (
                                                <ForumGuest key={guest.id} guest={guest} />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </footer>
                        </div>
                    </section>
                );
            })}
        </>
    );
}
