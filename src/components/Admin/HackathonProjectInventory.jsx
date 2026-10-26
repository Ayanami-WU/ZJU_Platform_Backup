import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../../services/api";
import { AdminButton, useAdminTheme } from "./AdminUI";
import "./HackathonRegistrationWorkspace.css";
import "./HackathonProjectInventory.css";

export default function HackathonProjectInventory({ eventKey, kind, registrationId }) {
    const { t } = useTranslation();
    const tr = (key, values) => t(`admin.hackathon_inventory.${key}`, values);
    const { isDayMode } = useAdminTheme();
    const [data, setData] = useState(null);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [query, setQuery] = useState("");
    const [track, setTrack] = useState("");
    const [page, setPage] = useState(1);
    const [view, setView] = useState("people");
    const personal = kind === "personal";
    const peopleView = personal && view === "people";
    useEffect(() => {
        let current = true;
        setData(null);
        setError(false);
        api.get("/admin/hackathon/project-inventory", {
            params: { event: eventKey, kind, registrationId },
            noRetry: true,
        })
            .then(({ data: result }) => {
                if (current) setData(result);
            })
            .catch(() => {
                if (current) setError(true);
            });
        return () => {
            current = false;
        };
    }, [eventKey, kind, registrationId, retry]);
    const filtered = useMemo(() => {
        const text = query.trim().toLocaleLowerCase();
        return (peopleView ? data?.profiles || [] : data?.rows || []).filter(
            (r) =>
                (!track || r.track === track) &&
                [
                    r.title,
                    r.team,
                    r.name,
                    r.major,
                    r.discipline,
                    r.industry,
                    ...(r.projectTitles || []),
                    ...(r.sources || []).map((s) => s.text),
                    ...(r.members || []).map((m) => m.name),
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLocaleLowerCase()
                    .includes(text)
        );
    }, [data, query, track, peopleView]);
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    const currentPage = Math.min(page, pages);
    const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);
    const distribution = (title, rows) => (
        <section>
            <h4>{title}</h4>
            <ul>
                {rows.map((r) => (
                    <li key={r.label}>
                        <span>{r.label}</span>
                        <strong>{r.count}</strong>
                        <span>{r.percent.toFixed(1)}%</span>
                    </li>
                ))}
            </ul>
        </section>
    );
    return (
        <section
            className={`hackathon-roster project-inventory ${isDayMode ? "roster-day" : "roster-night"}`}
            aria-label={tr(personal ? "personal" : "contest")}
        >
            <header className="roster-heading">
                <div>
                    <h3>{tr(personal ? "personal" : "contest")}</h3>
                    <p>{tr(personal ? "personalScope" : "contestScope")}</p>
                </div>
                <AdminButton onClick={() => setRetry((n) => n + 1)}>{tr("refresh")}</AdminButton>
            </header>
            {error ? (
                <p role="alert">{tr("error")}</p>
            ) : !data ? (
                <p role="status">{tr("loading")}</p>
            ) : (
                <>
                    <dl className="roster-stats">
                        <div>
                            <dt>{tr(personal ? "personalCount" : "contestCount")}</dt>
                            <dd>{data.summary.total}</dd>
                        </div>
                        {personal ? (
                            <>
                                <div>
                                    <dt>{tr("people")}</dt>
                                    <dd>{data.summary.people}</dd>
                                </div>
                                <div>
                                    <dt>{tr("links")}</dt>
                                    <dd>{data.summary.links}</dd>
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <dt>{tr("industryTrack")}</dt>
                                    <dd>{data.summary.industry}</dd>
                                </div>
                                <div>
                                    <dt>{tr("campusTrack")}</dt>
                                    <dd>{data.summary.campus}</dd>
                                </div>
                                <div>
                                    <dt>{tr("unknown")}</dt>
                                    <dd>{data.summary.unknown}</dd>
                                </div>
                            </>
                        )}
                    </dl>
                    {personal && (
                        <>
                            <p className="roster-note">
                                {tr("coverage", {
                                    total: data.summary.registrations,
                                    filled: data.summary.filled,
                                    people: data.summary.people,
                                    textOnly: data.summary.textOnly,
                                    blank: data.summary.blank,
                                })}
                            </p>
                            <div className="roster-switch" role="group" aria-label={tr("view")}>
                                {["people", "projects"].map((v) => (
                                    <button
                                        type="button"
                                        key={v}
                                        aria-pressed={view === v}
                                        onClick={() => {
                                            setView(v);
                                            setQuery("");
                                            setPage(1);
                                        }}
                                    >
                                        {tr(v === "people" ? "byPerson" : "byProject")}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {!personal && (
                        <details className="inventory-distribution" open>
                            <summary>{tr("distribution")}</summary>
                            <p>{tr("distributionNote")}</p>
                            <div>
                                {distribution(tr("discipline"), data.summary.disciplines)}
                                {distribution(tr("industry"), data.summary.industries)}
                            </div>
                        </details>
                    )}
                    <div className="roster-controls inventory-controls">
                        <label className="roster-search">
                            <span>{tr("search")}</span>
                            <input
                                value={query}
                                onChange={(e) => {
                                    setQuery(e.target.value);
                                    setPage(1);
                                }}
                                placeholder={tr(personal ? "searchPersonal" : "searchContest")}
                            />
                        </label>
                        {!personal && (
                            <label className="roster-filter">
                                <span>{tr("track")}</span>
                                <select
                                    value={track}
                                    onChange={(e) => {
                                        setTrack(e.target.value);
                                        setPage(1);
                                    }}
                                >
                                    <option value="">{tr("all")}</option>
                                    <option value="industry">{tr("industryTrack")}</option>
                                    <option value="campus">{tr("campusTrack")}</option>
                                </select>
                            </label>
                        )}
                        <p>
                            {tr(peopleView ? "filteredPeople" : "filtered", {
                                count: filtered.length,
                            })}
                        </p>
                    </div>
                    {!filtered.length ? (
                        <p>{tr("empty")}</p>
                    ) : (
                        <div className="inventory-list">
                            {visible.map((r) => (
                                <article key={r.id}>
                                    {peopleView ? (
                                        <>
                                            <div className="inventory-item-heading">
                                                <strong>{r.name}</strong>
                                                <span>{tr(`status_${r.status}`)}</span>
                                            </div>
                                            <p>{tr("personProjects", { count: r.projectCount })}</p>
                                            {!!r.projectTitles.length && (
                                                <ul>
                                                    {r.projectTitles.map((title, index) => (
                                                        <li key={index}>{title}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            {!!r.sources.length && (
                                                <details>
                                                    <summary>{tr("originalExperience")}</summary>
                                                    {r.sources.map((source, index) => (
                                                        <div
                                                            key={index}
                                                            className="inventory-evidence"
                                                        >
                                                            <p>
                                                                {tr(
                                                                    source.track === "industry"
                                                                        ? "industryTrack"
                                                                        : source.track === "campus"
                                                                          ? "campusTrack"
                                                                          : "registrationSource"
                                                                )}{" "}
                                                                · {tr(source.field)}
                                                            </p>
                                                            <pre>{source.text}</pre>
                                                        </div>
                                                    ))}
                                                </details>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            <div className="inventory-item-heading">
                                                <strong>{r.title || r.team}</strong>
                                                <span>
                                                    {personal
                                                        ? tr("personalLabel")
                                                        : tr(
                                                              r.track === "industry"
                                                                  ? "industryTrack"
                                                                  : "campusTrack"
                                                          )}
                                                </span>
                                            </div>
                                            <p>
                                                {r.discipline} · {r.industry}
                                            </p>
                                            {personal ? (
                                                <p>
                                                    {tr("members")}:{" "}
                                                    {r.members.map((m) => m.name).join("、")}
                                                </p>
                                            ) : (
                                                <p>
                                                    {tr("team")}: {r.team}
                                                </p>
                                            )}
                                            {r.notes && <p>{r.notes}</p>}
                                            <details>
                                                <summary>
                                                    {tr(personal ? "originalExperience" : "basis")}
                                                </summary>
                                                {personal ? (
                                                    r.members.map((m) => (
                                                        <section key={m.registrationId}>
                                                            <h4>{m.name}</h4>
                                                            {m.sources.map((source, index) => (
                                                                <div
                                                                    key={index}
                                                                    className="inventory-evidence"
                                                                >
                                                                    <p>
                                                                        {tr(
                                                                            source.track ===
                                                                                "industry"
                                                                                ? "industryTrack"
                                                                                : "campusTrack"
                                                                        )}{" "}
                                                                        · {tr(source.field)}
                                                                    </p>
                                                                    <pre>{source.text}</pre>
                                                                </div>
                                                            ))}
                                                        </section>
                                                    ))
                                                ) : (
                                                    <>
                                                        <p>{tr(`basis_${r.evidenceKind}`)}</p>
                                                        {r.evidence.sourceRows && (
                                                            <p>
                                                                {tr("sourceRows")}:{" "}
                                                                {r.evidence.sourceRows}
                                                            </p>
                                                        )}
                                                        {r.evidence.disciplineTags && (
                                                            <p>{r.evidence.disciplineTags}</p>
                                                        )}
                                                    </>
                                                )}
                                            </details>
                                        </>
                                    )}
                                </article>
                            ))}
                        </div>
                    )}
                    <nav className="roster-pagination" aria-label={tr("pagination")}>
                        <AdminButton
                            disabled={currentPage <= 1}
                            onClick={() => setPage(currentPage - 1)}
                        >
                            {tr("previous")}
                        </AdminButton>
                        <span>
                            {currentPage} / {pages}
                        </span>
                        <AdminButton
                            disabled={currentPage >= pages}
                            onClick={() => setPage(currentPage + 1)}
                        >
                            {tr("next")}
                        </AdminButton>
                    </nav>
                </>
            )}
        </section>
    );
}
