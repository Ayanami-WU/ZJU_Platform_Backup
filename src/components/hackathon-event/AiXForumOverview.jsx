import { CalendarDays, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./AiXForumOverview.css";

function ForumGuest({ guest, label }) {
    return (
        <div className="aix-forum-speaker" data-guest={guest.id}>
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
                {!guest.photo && (
                    <span className="aix-guest-initial" aria-hidden="true">
                        {guest.name.slice(0, 1)}
                    </span>
                )}
            </div>
            <div>
                <strong>
                    {guest.name}
                    {label && <span className="aix-forum-guest-label">{label}</span>}
                </strong>
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
                                        <h2>
                                            {forum.title}：
                                            <span className="aix-forum-theme">{forum.theme}</span>
                                        </h2>
                                    </div>
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
                                {forum.topicsLabel && (
                                    <h3 className="px-[26px] pb-2.5 pt-5 text-base font-semibold text-[var(--hx-muted)]">
                                        {forum.topicsLabel}
                                    </h3>
                                )}
                                {forum.topics.map((topic) => (
                                    <article
                                        className="aix-forum-topic-row"
                                        data-roundtable={topic.guestIds.length > 1 || undefined}
                                        data-without-topic={
                                            (!topic.title && !topic.time) || undefined
                                        }
                                        style={{
                                            "--aix-roundtable-count": topic.guestIds.length + 1,
                                        }}
                                        key={topic.speaker}
                                    >
                                        <div className="aix-forum-speakers">
                                            {topic.guestIds.length > 1 && (
                                                <ForumGuest
                                                    guest={copy.host}
                                                    label={copy.hostLabel}
                                                />
                                            )}
                                            {topic.guestIds
                                                .map((id) =>
                                                    forum.guests.find((guest) => guest.id === id)
                                                )
                                                .filter(Boolean)
                                                .map((guest) => (
                                                    <ForumGuest key={guest.id} guest={guest} />
                                                ))}
                                        </div>
                                        {(topic.title || topic.time) && (
                                            <div className="aix-forum-topic-copy">
                                                {topic.time && (
                                                    <time className="aix-forum-topic-time">
                                                        {topic.time}
                                                    </time>
                                                )}
                                                {topic.title && <h3>{topic.title}</h3>}
                                                {topic.host && <p>{topic.host}</p>}
                                            </div>
                                        )}
                                    </article>
                                ))}
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
                                {forum.judges?.length > 0 && (
                                    <section className="aix-forum-invited">
                                        <h3>{forum.judgesLabel}</h3>
                                        <div className="aix-forum-other-guests">
                                            {forum.judges.map((guest) => (
                                                <ForumGuest key={guest.id} guest={guest} />
                                            ))}
                                        </div>
                                    </section>
                                )}
                            </div>
                        </div>
                    </section>
                );
            })}
        </>
    );
}
