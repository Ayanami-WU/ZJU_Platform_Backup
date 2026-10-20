import test from "node:test";
import assert from "node:assert/strict";
import {
    activeRegistrationTracks,
    rosterStats,
    countDistribution,
    reportedTeamGroups,
    flatSearchText,
    missingForumFields,
    rosterDate,
    rosterTimestamp,
} from "./hackathonRoster.js";
const row = (id, user_id, entries) => ({
    id,
    user_id,
    event_key: "event",
    name: "同名",
    submissionDataLoaded: true,
    submissionRecords: [],
    form_data: { trackRegistrations: entries },
});
const entry = (team, isCaptain, teamSize, extra = {}) => ({
    answers: { team, isCaptain, teamSize, ...extra },
});
test("counts use accounts, include dual entries in each track and keep withdrawals separate", () => {
    const dual = row(1, 11, { industry: entry("A", "yes", "2"), campus: entry("B", "yes", "1") });
    const second = row(2, 12, { industry: entry("A", "no", "2") });
    const withdrawn = row(3, 13, {
        campus: { ...entry("C", "yes", "1"), cancelledAt: "2026-10-18" },
    });
    assert.deepEqual(activeRegistrationTracks(dual), ["industry", "campus"]);
    const stats = rosterStats([dual, second, withdrawn]);
    assert.deepEqual(
        [stats.people, stats.industry, stats.campus, stats.dual, stats.withdrawn],
        [2, 2, 1, 1, 1]
    );
    const forums = [
        { id: 1, userId: 11, major: "计算机" },
        { id: 2, userId: 11, major: "计算机" },
        { id: 3, userId: 12, major: "计算机" },
    ];
    assert.equal(rosterStats(forums, true).people, 2);
    assert.deepEqual(
        countDistribution(forums, (item) => item.major),
        [{ value: "计算机", count: 2 }]
    );
});
test("reported names stay separated by event and track, with explicit reconciliation flags", () => {
    const rows = [
        row(1, 1, { industry: entry("同名队", "yes", "2"), campus: entry("同名队", "yes", "1") }),
        row(2, 2, { industry: entry("同名队", "no", "2") }),
        { ...row(3, 3, { industry: entry("同名队", "yes", "4") }), event_key: "other" },
    ];
    const groups = reportedTeamGroups(rows);
    assert.equal(groups.length, 3);
    assert.equal(groups.find((group) => group.members.length === 2).needsReview, false);
    assert.equal(groups.find((group) => group.sizes.includes("4")).needsReview, true);
    assert.equal(reportedTeamGroups(rows, "campus").length, 1);
    assert(flatSearchText(rows).includes("同名队"));
});
test("legacy fields remain missing and SQL UTC timestamps render as Beijing time", () => {
    assert(
        missingForumFields({ name: "old", contact: "old@example.test" }).includes("aiCapabilities")
    );
    assert.equal(rosterTimestamp("2026-10-20 16:05:00"), rosterTimestamp("2026-10-20T16:05:00Z"));
    assert.match(rosterDate("2026-10-20 16:05:00"), /2026\/10\/21 00:05:00/);
});
