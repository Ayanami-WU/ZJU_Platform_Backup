import { registrationSubmissionState } from "./hackathonRegistrationSubmissions.js";

export const TRACK_KEYS = ["industry", "campus"];
export const FORUM_REQUIRED_FIELDS = [
    "school",
    "major",
    "grade",
    "name",
    "contact",
    "studentId",
    "projectExperience",
    "researchExperience",
    "aiCapabilities",
    "question",
];

export function registrationTrackEntries(row) {
    const data = row.form_data || {};
    if (data.trackRegistrations && typeof data.trackRegistrations === "object") {
        return Object.fromEntries(
            TRACK_KEYS.filter((key) => data.trackRegistrations[key]?.answers).map((key) => [
                key,
                data.trackRegistrations[key],
            ])
        );
    }
    const tracks = Array.isArray(data.track) ? data.track : [data.track];
    return Object.fromEntries(
        TRACK_KEYS.filter((key) => tracks.includes(key)).map((key) => [
            key,
            { answers: data, createdAt: row.created_at },
        ])
    );
}

export function activeRegistrationTracks(row) {
    return Object.entries(registrationTrackEntries(row))
        .filter(([, entry]) => entry.active !== false && !entry.cancelledAt)
        .map(([key]) => key);
}

export function missingForumFields(row) {
    return FORUM_REQUIRED_FIELDS.filter(
        (key) =>
            !(row.attendeeType === "internal" && key === "school") &&
            !(row.attendeeType === "external" && key === "studentId") &&
            !String(row[key] || "").trim()
    );
}

export function flatSearchText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return Object.values(value).map(flatSearchText).join(" ");
    return String(value);
}

// All counts are by account (or legacy row identity), never by display name or team name.
export function rosterPersonKey(row) {
    return String(row.user_id ?? row.userId ?? `legacy:${row.id}`);
}

export function rosterStats(rows, forum = false, isAiX = true) {
    const active =
        forum || !isAiX ? rows : rows.filter((row) => activeRegistrationTracks(row).length);
    const count = (subset) => new Set(subset.map(rosterPersonKey)).size;
    return {
        people: count(active),
        records: active.length,
        industry: count(active.filter((row) => activeRegistrationTracks(row).includes("industry"))),
        campus: count(active.filter((row) => activeRegistrationTracks(row).includes("campus"))),
        dual: count(active.filter((row) => activeRegistrationTracks(row).length === 2)),
        withdrawn: count(rows.filter((row) => !activeRegistrationTracks(row).length)),
        submitted: count(active.filter((row) => registrationSubmissionState(row) === "submitted")),
        unknown: count(active.filter((row) => registrationSubmissionState(row) === "unknown")),
        incomplete: count(active.filter((row) => missingForumFields(row).length)),
        internal: count(active.filter((row) => row.attendeeType === "internal")),
        external: count(active.filter((row) => row.attendeeType === "external")),
    };
}

export function countDistribution(rows, getValue) {
    const groups = new Map();
    for (const row of rows) {
        const value = String(getValue(row) || "").trim();
        const people = groups.get(value) || new Set();
        people.add(rosterPersonKey(row));
        groups.set(value, people);
    }
    return [...groups]
        .map(([value, people]) => ({ value, count: people.size }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"));
}

// These are exact reported-name groups for reconciliation, not authoritative team entities.
export function reportedTeamGroups(rows, trackFilter = "") {
    const groups = new Map();
    for (const row of rows) {
        const entries = registrationTrackEntries(row);
        for (const track of activeRegistrationTracks(row)) {
            if (trackFilter && trackFilter !== track) continue;
            const answers = entries[track].answers;
            const name = String(answers.team || "").trim();
            const key = JSON.stringify([row.event_key, track, name || `missing:${row.id}`]);
            const group = groups.get(key) || {
                key,
                track,
                name,
                members: [],
                sizes: new Set(),
                captains: [],
            };
            group.members.push(row);
            if (answers.teamSize) group.sizes.add(String(answers.teamSize));
            if (answers.isCaptain === "yes") group.captains.push(row);
            groups.set(key, group);
        }
    }
    return [...groups.values()]
        .map((group) => ({
            ...group,
            sizes: [...group.sizes],
            needsReview:
                !group.name ||
                group.captains.length !== 1 ||
                group.sizes.size !== 1 ||
                Number([...group.sizes][0]) !== new Set(group.members.map(rosterPersonKey)).size,
        }))
        .sort(
            (a, b) =>
                Number(b.needsReview) - Number(a.needsReview) ||
                a.name.localeCompare(b.name, "zh-CN")
        );
}

export function rosterTimestamp(value) {
    if (!value) return NaN;
    // SQLite CURRENT_TIMESTAMP is UTC despite having no suffix.
    const normalized = /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)
        ? value.replace(" ", "T") + "Z"
        : value;
    return new Date(normalized).getTime();
}

export function rosterDate(value, language = "zh-CN") {
    if (!value) return "—";
    const timestamp = rosterTimestamp(value);
    return Number.isNaN(timestamp)
        ? String(value)
        : new Date(timestamp).toLocaleString(language, {
              timeZone: "Asia/Shanghai",
              hour12: false,
          });
}
