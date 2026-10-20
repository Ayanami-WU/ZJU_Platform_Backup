import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronLeft,
    ChevronRight,
    Columns3,
    Copy,
    Download,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import toast from "react-hot-toast";
import api from "../../services/api";
import { AIX_EVENT_KEY, safeWebUrl } from "../../utils/hackathonAiX";
import { formatHackathonAnswer } from "../../data/hackathonTemplate";
import {
    registrationAnswers,
    registrationFieldsByEvent,
    registrationField,
    registrationExportTable,
    escapeCsv,
} from "../../utils/hackathonRegistrationData";
import {
    activeRegistrationTracks,
    registrationTrackEntries,
    missingForumFields,
    flatSearchText,
    rosterStats,
    countDistribution,
    reportedTeamGroups,
    rosterDate,
    rosterTimestamp,
    FORUM_REQUIRED_FIELDS,
} from "../../utils/hackathonRoster";
import { registrationSubmissionState } from "../../utils/hackathonRegistrationSubmissions";
import { AdminButton, AdminEmptyState, useAdminTheme } from "./AdminUI";
import RegistrationSubmissionData from "./RegistrationSubmissionData";
import "./HackathonRegistrationWorkspace.css";

const gradeLabels = {
    freshman: "大一",
    sophomore: "大二",
    junior: "大三",
    senior: "大四",
    master: "硕士",
    phd: "博士",
};
const defaults = {
    competition: [
        "contact",
        "major",
        "grade",
        "tracksLabel",
        "teamsLabel",
        "workStatus",
        "createdAt",
    ],
    forum: ["contact", "school", "major", "grade", "sessionLabel", "completeLabel", "createdAt"],
};
const preferenceKey = "hackathon-roster-columns-v1";
const loadColumns = () => {
    try {
        const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
        return value &&
            ["competition", "forum"].every(
                (key) =>
                    Array.isArray(value[key]) && value[key].every((id) => typeof id === "string")
            )
            ? value
            : defaults;
    } catch {
        return defaults;
    }
};

export default function HackathonRegistrationWorkspace({
    registrations,
    events,
    eventKey,
    onDelete,
}) {
    const { t, i18n } = useTranslation();
    const tr = useCallback((key, values) => t(`admin.hackathon_roster.${key}`, values), [t]);
    const { isDayMode } = useAdminTheme();
    const isAiX = eventKey === AIX_EVENT_KEY;
    const [source, setSource] = useState("competition");
    const [view, setView] = useState("people");
    const [forumRows, setForumRows] = useState(null);
    const [forumLoading, setForumLoading] = useState(false);
    const [forumError, setForumError] = useState(false);
    const [forumRetry, setForumRetry] = useState(0);
    const [query, setQuery] = useState("");
    const [track, setTrack] = useState("");
    const [grade, setGrade] = useState("");
    const [school, setSchool] = useState("");
    const [major, setMajor] = useState("");
    const [status, setStatus] = useState("");
    const [stage, setStage] = useState("");
    const [participation, setParticipation] = useState("active");
    const [session, setSession] = useState("");
    const [attendee, setAttendee] = useState("");
    const [incomplete, setIncomplete] = useState(false);
    const [teamReview, setTeamReview] = useState(false);
    const [columns, setColumns] = useState(loadColumns);
    const [wrap, setWrap] = useState(false);
    const [sort, setSort] = useState({ key: "createdAt", direction: -1 });
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [selectedIds, setSelectedIds] = useState([]);
    const [detailId, setDetailId] = useState(null);
    const panel = useRef(null);
    const opener = useRef(null);
    const forum = source === "forum";
    const language = i18n.language.startsWith("en") ? "en-GB" : "zh-CN";
    const fieldMaps = useMemo(() => registrationFieldsByEvent(events), [events]);
    const trackLabel = (key) => tr(key === "industry" ? "industry" : "campus");
    const submissionFor = (row) =>
        !row.submissionDataLoaded
            ? "unknown"
            : registrationSubmissionState({
                  ...row,
                  submissionRecords: row.submissionRecords.filter(
                      (record) =>
                          (!stage || record.stage === stage) && (!track || record.track === track)
                  ),
              });
    useEffect(() => {
        if (!forum) return;
        let active = true;
        setForumLoading(true);
        setForumError(false);
        api.get("/admin/hackathon/forums/registrations", { noRetry: true })
            .then(({ data }) => {
                if (!Array.isArray(data?.registrations)) throw new Error("Invalid roster");
                if (active) setForumRows(data.registrations);
            })
            .catch(() => {
                if (active) setForumError(true);
            })
            .finally(() => {
                if (active) setForumLoading(false);
            });
        return () => {
            active = false;
        };
    }, [forum, forumRetry]);
    useEffect(() => {
        try {
            localStorage.setItem(preferenceKey, JSON.stringify(columns));
        } catch {
            /* Optional preference. */
        }
    }, [columns]);
    const rows = useMemo(
        () => (forum ? forumRows || [] : registrations.filter((row) => row.event_key === eventKey)),
        [forum, forumRows, registrations, eventKey]
    );
    const valueFor = (row, id) => {
        if (id === "createdAt") return rosterDate(row.createdAt || row.created_at, language);
        if (id === "tracksLabel")
            return activeRegistrationTracks(row).map(trackLabel).join(" / ") || tr("withdrawn");
        if (id === "teamsLabel")
            return activeRegistrationTracks(row)
                .map(
                    (key) =>
                        `${trackLabel(key)} · ${registrationTrackEntries(row)[key].answers.team || tr("unfilled")}`
                )
                .join(" / ");
        if (id === "workStatus") return tr(`status_${submissionFor(row)}`);
        if (forum) {
            if (id === "sessionLabel")
                return tr(row.forumKey === "technology" ? "technology" : "entrepreneurship");
            if (id === "completeLabel")
                return tr(missingForumFields(row).length ? "incomplete" : "complete");
            if (id === "attendeeType")
                return tr(
                    row.attendeeType === "internal"
                        ? "internal"
                        : row.attendeeType === "external"
                          ? "external"
                          : "unfilled"
                );
            return row[id] || "";
        }
        const field = registrationField(fieldMaps, row.event_key, id);
        const scoped = track && registrationTrackEntries(row)[track]?.answers;
        return formatHackathonAnswer(
            scoped && Object.hasOwn(scoped, id) ? scoped[id] : registrationAnswers(row)[id],
            field
        );
    };
    const allColumns = useMemo(() => {
        const result = new Map();
        const add = (id, label) => result.set(id, { id, label });
        add("name", tr("name"));
        if (forum) {
            for (const id of FORUM_REQUIRED_FIELDS.filter((key) => key !== "name"))
                add(id, t(`aix.forumPage.fields.${id}`));
            for (const [id, key] of [
                ["attendeeType", "identity"],
                ["sessionLabel", "session"],
                ["completeLabel", "completeness"],
            ])
                add(id, tr(key));
            add("organization", t("aix.forumPage.fields.organization"));
        } else {
            for (const [id, key] of [
                ["studentId", "studentId"],
                ["contact", "contact"],
                ["major", "major"],
                ["grade", "grade"],
                ["tracksLabel", "track"],
                ["teamsLabel", "team"],
                ["workStatus", "submission"],
            ])
                add(id, tr(key));
            const template = events.find((item) => item.event.key === eventKey);
            for (const field of template?.form?.fields || [])
                if (!result.has(field.id) && field.id !== "track") add(field.id, field.label);
            for (const row of rows)
                for (const [id, value] of Object.entries(registrationAnswers(row)))
                    if (!result.has(id) && id !== "track" && value !== "" && value != null)
                        add(id, registrationField(fieldMaps, row.event_key, id).label);
        }
        add("createdAt", tr("createdAt"));
        return [...result.values()];
    }, [forum, rows, events, eventKey, fieldMaps, tr, t]);
    const shownColumns = allColumns.filter(
        (col) => col.id === "name" || columns[source].includes(col.id)
    );
    const activeRows =
        forum || !isAiX ? rows : rows.filter((row) => activeRegistrationTracks(row).length);
    const stats = rosterStats(rows, forum, isAiX);
    const distributions = [
        { id: "school", value: school, set: setSchool },
        { id: "major", value: major, set: setMajor },
        { id: "grade", value: grade, set: setGrade },
    ]
        .filter((item) => forum || item.id !== "school")
        .map((item) => ({
            ...item,
            label: tr(item.id),
            groups: countDistribution(activeRows, (row) =>
                forum ? row[item.id] : registrationAnswers(row)[item.id]
            ),
        }));
    const filtered = rows
        .filter((row) => {
            const tracks = activeRegistrationTracks(row);
            if (!forum && isAiX) {
                if (participation === "active" && !tracks.length) return false;
                if (participation === "dual" && tracks.length !== 2) return false;
                if (participation === "withdrawn" && tracks.length) return false;
                if (track && !tracks.includes(track)) return false;
                if (status && submissionFor(row) !== status) return false;
            }
            if (
                forum &&
                ((session && row.forumKey !== session) ||
                    (attendee && row.attendeeType !== attendee) ||
                    (incomplete && !missingForumFields(row).length))
            )
                return false;
            for (const [id, filter] of [
                ["grade", grade],
                ["major", major],
                ["school", school],
            ])
                if (
                    filter &&
                    String((forum ? row[id] : registrationAnswers(row)[id]) || "").trim() !==
                        (filter === "__empty__" ? "" : filter)
                )
                    return false;
            return (
                !query.trim() ||
                flatSearchText(forum ? row : { ...row, form_data_json: undefined })
                    .toLocaleLowerCase()
                    .includes(query.trim().toLocaleLowerCase())
            );
        })
        .sort((a, b) => {
            const value = (row) =>
                sort.key === "createdAt"
                    ? rosterTimestamp(row.createdAt || row.created_at) || 0
                    : valueFor(row, sort.key);
            return (
                sort.direction *
                    String(value(a)).localeCompare(String(value(b)), language, { numeric: true }) ||
                String(a.id).localeCompare(String(b.id), language, { numeric: true })
            );
        });
    const matchingIds = new Set(filtered.map((row) => row.id));
    const teams = reportedTeamGroups(activeRows, track)
        .filter((team) => team.members.some((row) => matchingIds.has(row.id)))
        .filter((team) => !teamReview || team.needsReview);
    const totalPages = Math.max(
        1,
        Math.ceil((view === "teams" ? teams.length : filtered.length) / pageSize)
    );
    const currentPage = Math.min(page, totalPages);
    const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const detailIndex = filtered.findIndex((row) => row.id === detailId);
    const detail = filtered[detailIndex];
    useEffect(() => {
        setPage(1);
        setSelectedIds([]);
        setDetailId(null);
    }, [
        source,
        query,
        track,
        grade,
        school,
        major,
        status,
        stage,
        participation,
        session,
        attendee,
        incomplete,
        view,
        teamReview,
    ]);
    useEffect(() => {
        if (!detail) return;
        panel.current?.focus({ preventScroll: true });
        if (window.innerWidth < 1000)
            panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, [detail?.id]);
    const closeDetail = () => {
        setDetailId(null);
        opener.current?.focus();
    };
    const openDetail = (row, target) => {
        opener.current = target;
        setDetailId(row.id);
    };
    const reset = () => {
        setQuery("");
        setTrack("");
        setGrade("");
        setSchool("");
        setMajor("");
        setStatus("");
        setStage("");
        setParticipation("active");
        setSession("");
        setAttendee("");
        setIncomplete(false);
        setTeamReview(false);
    };
    const copy = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(tr("copied"));
        } catch {
            toast.error(tr("copyFailed"));
        }
    };
    const exportRows = (selected = false) => {
        const data = selected ? filtered.filter((row) => selectedIds.includes(row.id)) : filtered;
        let table;
        if (forum)
            table = [
                allColumns.map((col) => col.label),
                ...data.map((row) => allColumns.map((col) => valueFor(row, col.id))),
            ];
        else {
            table = registrationExportTable(data, events, eventKey);
            table[0].unshift(tr("participation"));
            table
                .slice(1)
                .forEach((row, index) => row.unshift(valueFor(data[index], "tracksLabel")));
        }
        const csv =
            "\uFEFF" +
            table.map((row) => row.map((cell) => `"${escapeCsv(cell)}"`).join(",")).join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `hackathon_${source}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const filterSelect = (label, value, set, options) => (
        <label className="roster-filter">
            <span>{label}</span>
            <select aria-label={label} value={value} onChange={(event) => set(event.target.value)}>
                <option value="">{tr("all")}</option>
                {options.map(([key, text]) => (
                    <option key={key} value={key}>
                        {text}
                    </option>
                ))}
            </select>
        </label>
    );
    const metrics = forum
        ? [
              ["people", stats.people],
              ["records", stats.records],
              ["internal", stats.internal],
              ["external", stats.external],
              ["incomplete", stats.incomplete],
          ]
        : [
              ["people", stats.people],
              ...(isAiX
                  ? [
                        ["industry", stats.industry],
                        ["campus", stats.campus],
                        ["dual", stats.dual],
                        ["withdrawn", stats.withdrawn],
                    ]
                  : []),
              [
                  "submittedPeople",
                  stats.unknown === activeRows.length && activeRows.length ? "—" : stats.submitted,
              ],
          ];
    const detailItems = detail
        ? allColumns.filter(
              (col) =>
                  !col.id.startsWith("work__") &&
                  !/^(industry|campus)__/.test(col.id) &&
                  !(
                      Object.keys(registrationTrackEntries(detail)).length &&
                      [
                          "team",
                          "teamSize",
                          "isCaptain",
                          "experience",
                          "researchExperience",
                          "projectLinks",
                          "strengths",
                          "aiToolsOther",
                      ].includes(col.id)
                  ) &&
                  !["name", "workStatus", "tracksLabel", "teamsLabel", "createdAt"].includes(
                      col.id
                  ) &&
                  String(valueFor(detail, col.id) || "").trim()
          )
        : [];
    const selectedVisible = filtered.filter((row) => selectedIds.includes(row.id)).length;
    const changeSource = (key) => {
        reset();
        setSource(key);
        setView("people");
    };

    return (
        <section
            className={`hackathon-roster ${isDayMode ? "roster-day" : "roster-night"}`}
            aria-label={tr("workspace")}
        >
            <header className="roster-heading">
                <div>
                    <h3>{tr("workspace")}</h3>
                    <p>{tr("scope")}</p>
                </div>
                {isAiX && (
                    <div className="roster-switch" role="group" aria-label={tr("source")}>
                        {["competition", "forum"].map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={source === key}
                                onClick={() => changeSource(key)}
                            >
                                {tr(key)}
                            </button>
                        ))}
                    </div>
                )}
            </header>
            {forum && forumLoading && <p role="status">{tr("loading")}</p>}
            {forum && forumError ? (
                <div role="alert" className="roster-error">
                    <p>{tr("loadFailed")}</p>
                    <AdminButton onClick={() => setForumRetry((n) => n + 1)}>
                        <RefreshCw size={16} />
                        {tr("retry")}
                    </AdminButton>
                </div>
            ) : (
                <>
                    <dl className="roster-stats">
                        {metrics.map(([key, value]) => (
                            <div key={key}>
                                <dt>{tr(key)}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                    {!forum && isAiX && (
                        <p className="roster-note">
                            {tr("trackCountHint")}
                            {stats.unknown > 0 &&
                                ` ${tr("unknownCount", { count: stats.unknown })}`}
                        </p>
                    )}
                    <details className="roster-distributions" open>
                        <summary>{tr("distribution")}</summary>
                        <div>
                            {distributions.map((item) => (
                                <section key={item.id}>
                                    <h4>{item.label}</h4>
                                    {item.groups.length ? (
                                        item.groups.slice(0, 6).map((group) => (
                                            <button
                                                key={group.value}
                                                type="button"
                                                aria-pressed={
                                                    item.value === (group.value || "__empty__")
                                                }
                                                onClick={() =>
                                                    item.set(
                                                        item.value === (group.value || "__empty__")
                                                            ? ""
                                                            : group.value || "__empty__"
                                                    )
                                                }
                                            >
                                                <span>
                                                    {item.id === "grade"
                                                        ? gradeLabels[group.value] ||
                                                          group.value ||
                                                          tr("unfilled")
                                                        : group.value || tr("unfilled")}
                                                </span>
                                                <meter
                                                    min="0"
                                                    max={stats.people || 1}
                                                    value={group.count}
                                                />
                                                <strong>{group.count}</strong>
                                            </button>
                                        ))
                                    ) : (
                                        <p>{tr("noData")}</p>
                                    )}
                                </section>
                            ))}
                        </div>
                    </details>
                    <div className="roster-controls">
                        <label className="roster-search">
                            <Search size={17} />
                            <input
                                aria-label={tr("search")}
                                placeholder={tr("searchHint")}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>
                        <div className="roster-filter-row">
                            {!forum && isAiX && (
                                <>
                                    {filterSelect(
                                        tr("track"),
                                        track,
                                        setTrack,
                                        ["industry", "campus"].map((key) => [key, trackLabel(key)])
                                    )}
                                    {filterSelect(
                                        tr("participation"),
                                        participation,
                                        setParticipation,
                                        ["active", "dual", "withdrawn"].map((key) => [key, tr(key)])
                                    )}
                                    {filterSelect(
                                        tr("stage"),
                                        stage,
                                        setStage,
                                        ["initial", "semifinal", "final"].map((key) => [
                                            key,
                                            tr(key),
                                        ])
                                    )}
                                    {filterSelect(
                                        tr("submission"),
                                        status,
                                        setStatus,
                                        ["submitted", "draft", "none", "unknown"].map((key) => [
                                            key,
                                            tr(`status_${key}`),
                                        ])
                                    )}
                                </>
                            )}
                            {forum && (
                                <>
                                    {filterSelect(
                                        tr("session"),
                                        session,
                                        setSession,
                                        ["technology", "entrepreneurship"].map((key) => [
                                            key,
                                            tr(key),
                                        ])
                                    )}
                                    {filterSelect(
                                        tr("identity"),
                                        attendee,
                                        setAttendee,
                                        ["internal", "external"].map((key) => [key, tr(key)])
                                    )}
                                    <label className="roster-check">
                                        <input
                                            type="checkbox"
                                            checked={incomplete}
                                            onChange={(event) =>
                                                setIncomplete(event.target.checked)
                                            }
                                        />
                                        {tr("onlyIncomplete")}
                                    </label>
                                    <AdminButton
                                        tone="subtle"
                                        disabled={forumLoading}
                                        onClick={() => setForumRetry((n) => n + 1)}
                                    >
                                        <RefreshCw size={15} />
                                        {tr("refreshForum")}
                                    </AdminButton>
                                </>
                            )}
                            {distributions.map((item) => (
                                <span key={item.id}>
                                    {filterSelect(
                                        item.label,
                                        item.value,
                                        item.set,
                                        item.groups.map((group) => [
                                            group.value || "__empty__",
                                            (item.id === "grade"
                                                ? gradeLabels[group.value] || group.value
                                                : group.value) || tr("unfilled"),
                                        ])
                                    )}
                                </span>
                            ))}
                            <button type="button" className="roster-text-button" onClick={reset}>
                                {tr("reset")}
                            </button>
                        </div>
                    </div>
                    <div className="roster-table-toolbar">
                        <div className="roster-switch" role="group" aria-label={tr("view")}>
                            {["people", ...(!forum && isAiX ? ["teams"] : [])].map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    aria-pressed={view === key}
                                    onClick={() => setView(key)}
                                >
                                    {tr(key === "people" ? "peopleView" : key)}
                                </button>
                            ))}
                        </div>
                        <div className="roster-table-actions">
                            <label className="roster-check">
                                <input
                                    type="checkbox"
                                    checked={wrap}
                                    onChange={(event) => setWrap(event.target.checked)}
                                />
                                {tr("wrap")}
                            </label>
                            <details className="roster-columns">
                                <summary>
                                    <Columns3 size={16} />
                                    {tr("columns")}
                                </summary>
                                <div>
                                    {allColumns
                                        .filter((col) => col.id !== "name")
                                        .map((col) => (
                                            <label key={col.id}>
                                                <input
                                                    type="checkbox"
                                                    checked={columns[source].includes(col.id)}
                                                    onChange={(event) =>
                                                        setColumns((current) => ({
                                                            ...current,
                                                            [source]: event.target.checked
                                                                ? [...current[source], col.id]
                                                                : current[source].filter(
                                                                      (id) => id !== col.id
                                                                  ),
                                                        }))
                                                    }
                                                />
                                                {col.label}
                                            </label>
                                        ))}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setColumns((current) => ({
                                                ...current,
                                                [source]: defaults[source],
                                            }))
                                        }
                                    >
                                        {tr("restoreColumns")}
                                    </button>
                                </div>
                            </details>
                            {selectedVisible > 0 && (
                                <AdminButton tone="subtle" onClick={() => exportRows(true)}>
                                    {tr("exportSelected", { count: selectedVisible })}
                                </AdminButton>
                            )}
                            <AdminButton
                                tone="primary"
                                disabled={!filtered.length || forumLoading}
                                onClick={() => exportRows()}
                            >
                                <Download size={16} />
                                {tr("exportFiltered", { count: filtered.length })}
                            </AdminButton>
                        </div>
                    </div>
                    <p className="roster-note" role="status">
                        {tr("resultCount", { count: filtered.length })}
                        {selectedVisible
                            ? ` · ${tr("selectedCount", { count: selectedVisible })}`
                            : ""}{" "}
                        · {tr("readHint")}
                    </p>
                    {view === "teams" && (
                        <label className="roster-check">
                            <input
                                type="checkbox"
                                checked={teamReview}
                                onChange={(event) => setTeamReview(event.target.checked)}
                            />
                            {tr("onlyTeamReview")}
                        </label>
                    )}
                    <div className={`roster-reading-layout ${detail ? "has-detail" : ""}`}>
                        <div className="roster-list">
                            {view === "teams" ? (
                                <div className="roster-teams">
                                    <p className="roster-note">{tr("teamHint")}</p>
                                    {teams
                                        .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                                        .map((team) => (
                                            <details key={team.key}>
                                                <summary>
                                                    <strong>
                                                        {team.name || tr("unfilledTeam")}
                                                    </strong>
                                                    <span>{trackLabel(team.track)}</span>
                                                    <span>
                                                        {tr("observedMembers", {
                                                            count: team.members.length,
                                                        })}{" "}
                                                        /{" "}
                                                        {tr("declaredSize", {
                                                            size: team.sizes.join(" / ") || "—",
                                                        })}
                                                    </span>
                                                    <span
                                                        className={
                                                            team.needsReview ? "roster-warning" : ""
                                                        }
                                                    >
                                                        {tr(
                                                            team.needsReview
                                                                ? "needsReview"
                                                                : "consistent"
                                                        )}
                                                    </span>
                                                </summary>
                                                <p>
                                                    {tr("captains")}:{" "}
                                                    {team.captains
                                                        .map((row) => row.name)
                                                        .join("、") || tr("unfilled")}
                                                </p>
                                                <ul>
                                                    {team.members.map((row) => (
                                                        <li key={row.id}>
                                                            <button
                                                                type="button"
                                                                onClick={(event) =>
                                                                    openDetail(
                                                                        row,
                                                                        event.currentTarget
                                                                    )
                                                                }
                                                            >
                                                                {row.name}
                                                            </button>
                                                            <span>
                                                                {valueFor(row, "contact") || "—"}
                                                            </span>
                                                            <span>
                                                                {valueFor(row, "workStatus")}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </details>
                                        ))}
                                    {!teams.length && <AdminEmptyState title={tr("noMatches")} />}
                                </div>
                            ) : (
                                <div
                                    className={`roster-table-scroll ${wrap ? "roster-wrap" : ""}`}
                                    tabIndex={0}
                                    role="region"
                                    aria-label={tr("tableScroll")}
                                >
                                    <table>
                                        <caption className="sr-only">{tr("tableCaption")}</caption>
                                        <thead>
                                            <tr>
                                                <th className="roster-select-cell">
                                                    <input
                                                        type="checkbox"
                                                        aria-label={tr("selectPage")}
                                                        checked={
                                                            pageRows.length > 0 &&
                                                            pageRows.every((row) =>
                                                                selectedIds.includes(row.id)
                                                            )
                                                        }
                                                        onChange={(event) =>
                                                            setSelectedIds((current) =>
                                                                event.target.checked
                                                                    ? [
                                                                          ...new Set([
                                                                              ...current,
                                                                              ...pageRows.map(
                                                                                  (row) => row.id
                                                                              ),
                                                                          ]),
                                                                      ]
                                                                    : current.filter(
                                                                          (id) =>
                                                                              !pageRows.some(
                                                                                  (row) =>
                                                                                      row.id === id
                                                                              )
                                                                      )
                                                            )
                                                        }
                                                    />
                                                </th>
                                                {shownColumns.map((col) => (
                                                    <th
                                                        key={col.id}
                                                        className={
                                                            col.id === "name"
                                                                ? "roster-name-cell"
                                                                : ""
                                                        }
                                                        aria-sort={
                                                            sort.key === col.id
                                                                ? sort.direction === 1
                                                                    ? "ascending"
                                                                    : "descending"
                                                                : "none"
                                                        }
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setSort((current) => ({
                                                                    key: col.id,
                                                                    direction:
                                                                        current.key === col.id
                                                                            ? -current.direction
                                                                            : 1,
                                                                }))
                                                            }
                                                        >
                                                            {col.label}
                                                            <span aria-hidden="true">
                                                                {sort.key === col.id
                                                                    ? sort.direction === 1
                                                                        ? " ↑"
                                                                        : " ↓"
                                                                    : " ↕"}
                                                            </span>
                                                        </button>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageRows.map((row) => (
                                                <tr
                                                    key={row.id}
                                                    data-selected={
                                                        detailId === row.id ||
                                                        selectedIds.includes(row.id)
                                                    }
                                                >
                                                    <td className="roster-select-cell">
                                                        <input
                                                            type="checkbox"
                                                            aria-label={tr("selectPerson", {
                                                                name: row.name,
                                                            })}
                                                            checked={selectedIds.includes(row.id)}
                                                            onChange={(event) =>
                                                                setSelectedIds((current) =>
                                                                    event.target.checked
                                                                        ? [...current, row.id]
                                                                        : current.filter(
                                                                              (id) => id !== row.id
                                                                          )
                                                                )
                                                            }
                                                        />
                                                    </td>
                                                    {shownColumns.map((col) => (
                                                        <td
                                                            key={col.id}
                                                            className={
                                                                col.id === "name"
                                                                    ? "roster-name-cell"
                                                                    : ""
                                                            }
                                                        >
                                                            {col.id === "name" ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={tr("readPerson", {
                                                                        name: row.name,
                                                                    })}
                                                                    className="roster-person"
                                                                    onClick={(event) =>
                                                                        openDetail(
                                                                            row,
                                                                            event.currentTarget
                                                                        )
                                                                    }
                                                                >
                                                                    {row.name || tr("unfilled")}
                                                                    <small>
                                                                        {row.student_id ||
                                                                            row.studentId ||
                                                                            tr("noStudentId")}
                                                                    </small>
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    className={
                                                                        col.id === "workStatus" ||
                                                                        col.id === "completeLabel"
                                                                            ? "roster-status"
                                                                            : ""
                                                                    }
                                                                    title={String(
                                                                        valueFor(row, col.id) || ""
                                                                    )}
                                                                >
                                                                    {valueFor(row, col.id) || "—"}
                                                                </span>
                                                            )}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {!pageRows.length && (
                                        <AdminEmptyState
                                            title={tr("noMatches")}
                                            description={tr("resetHint")}
                                        />
                                    )}
                                </div>
                            )}
                            <footer className="roster-pagination">
                                <span>
                                    {tr("pagination", { page: currentPage, pages: totalPages })}
                                </span>
                                <label>
                                    {tr("pageSize")}
                                    <select
                                        aria-label={tr("pageSize")}
                                        value={pageSize}
                                        onChange={(event) => {
                                            setPageSize(Number(event.target.value));
                                            setPage(1);
                                        }}
                                    >
                                        {[20, 50, 100].map((size) => (
                                            <option key={size} value={size}>
                                                {size}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <AdminButton
                                    tone="subtle"
                                    disabled={currentPage === 1}
                                    onClick={() => setPage(currentPage - 1)}
                                >
                                    <ChevronLeft size={16} />
                                    {tr("previous")}
                                </AdminButton>
                                <AdminButton
                                    tone="subtle"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setPage(currentPage + 1)}
                                >
                                    {tr("next")}
                                    <ChevronRight size={16} />
                                </AdminButton>
                            </footer>
                        </div>
                        {detail && (
                            <aside
                                className="roster-detail"
                                ref={panel}
                                tabIndex={-1}
                                aria-label={tr("detail")}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") closeDetail();
                                }}
                            >
                                <header>
                                    <div>
                                        <h4>{detail.name || tr("unfilled")}</h4>
                                        <p>{valueFor(detail, "createdAt")}</p>
                                    </div>
                                    <button
                                        type="button"
                                        aria-label={tr("closeDetail")}
                                        onClick={closeDetail}
                                    >
                                        <X size={20} />
                                    </button>
                                </header>
                                <nav aria-label={tr("browsePeople")}>
                                    <AdminButton
                                        tone="subtle"
                                        disabled={detailIndex <= 0}
                                        onClick={() => setDetailId(filtered[detailIndex - 1].id)}
                                    >
                                        <ChevronLeft size={15} />
                                        {tr("previousPerson")}
                                    </AdminButton>
                                    <span>
                                        {detailIndex + 1} / {filtered.length}
                                    </span>
                                    <AdminButton
                                        tone="subtle"
                                        disabled={detailIndex >= filtered.length - 1}
                                        onClick={() => setDetailId(filtered[detailIndex + 1].id)}
                                    >
                                        {tr("nextPerson")}
                                        <ChevronRight size={15} />
                                    </AdminButton>
                                </nav>
                                {forum && missingForumFields(detail).length > 0 && (
                                    <p className="roster-warning">
                                        {tr("legacyMissing")}:{" "}
                                        {missingForumFields(detail)
                                            .map((id) => t(`aix.forumPage.fields.${id}`))
                                            .join("、")}
                                    </p>
                                )}
                                <dl>
                                    {detailItems.map((col) => (
                                        <div key={col.id}>
                                            <dt>
                                                {col.label}
                                                {["contact", "studentId"].includes(col.id) && (
                                                    <button
                                                        type="button"
                                                        aria-label={tr("copyField", {
                                                            field: col.label,
                                                        })}
                                                        onClick={() =>
                                                            copy(String(valueFor(detail, col.id)))
                                                        }
                                                    >
                                                        <Copy size={14} />
                                                    </button>
                                                )}
                                            </dt>
                                            <dd>
                                                {safeWebUrl(String(valueFor(detail, col.id))) ? (
                                                    <a
                                                        href={safeWebUrl(
                                                            String(valueFor(detail, col.id))
                                                        )}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                    >
                                                        {valueFor(detail, col.id)}
                                                    </a>
                                                ) : (
                                                    valueFor(detail, col.id)
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                                {!forum &&
                                    Object.entries(registrationTrackEntries(detail)).map(
                                        ([key, entry]) => (
                                            <section className="roster-track-detail" key={key}>
                                                <h4>
                                                    {trackLabel(key)} ·{" "}
                                                    {tr(
                                                        entry.active === false || entry.cancelledAt
                                                            ? "withdrawn"
                                                            : "active"
                                                    )}
                                                </h4>
                                                <p className="roster-note">
                                                    {rosterDate(entry.createdAt, language)}
                                                </p>
                                                <dl>
                                                    {Object.entries(entry.answers)
                                                        .filter(
                                                            ([id, value]) =>
                                                                ![
                                                                    "name",
                                                                    "studentId",
                                                                    "major",
                                                                    "grade",
                                                                    "track",
                                                                    "trackRegistrations",
                                                                ].includes(id) &&
                                                                value !== "" &&
                                                                value != null
                                                        )
                                                        .map(([id, value]) => {
                                                            const field = registrationField(
                                                                fieldMaps,
                                                                detail.event_key,
                                                                id
                                                            );
                                                            const text = formatHackathonAnswer(
                                                                value,
                                                                field
                                                            );
                                                            const url = safeWebUrl(text);
                                                            return (
                                                                <div key={id}>
                                                                    <dt>{field.label}</dt>
                                                                    <dd>
                                                                        {url ? (
                                                                            <a
                                                                                href={url}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                            >
                                                                                {text}
                                                                            </a>
                                                                        ) : (
                                                                            text
                                                                        )}
                                                                    </dd>
                                                                </div>
                                                            );
                                                        })}
                                                </dl>
                                            </section>
                                        )
                                    )}
                                {!forum && detail.event_key === AIX_EVENT_KEY && (
                                    <section className="roster-detail-submissions">
                                        <h4>{tr("submissionMaterials")}</h4>
                                        <RegistrationSubmissionData registration={detail} />
                                    </section>
                                )}
                                {!forum && (
                                    <div className="roster-danger">
                                        <AdminButton
                                            tone="danger"
                                            onClick={() => onDelete(detail.id)}
                                        >
                                            {tr("delete")}
                                        </AdminButton>
                                    </div>
                                )}
                            </aside>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
