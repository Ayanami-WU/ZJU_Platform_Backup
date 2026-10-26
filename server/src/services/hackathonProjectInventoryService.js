const crypto = require("node:crypto");
const { trackRegistrations } = require("./hackathonTrackRegistrationService");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const json = (value) => JSON.stringify(value);
const fail = (message) => {
    throw new Error(message);
};

function registrationFingerprint(row) {
    return hash(json([row.id, row.name, row.major, row.grade, row.form_data_json]));
}

// The caller owns BEGIN/COMMIT/ROLLBACK, including preview rollback.
async function importProjectInventory(db, manifest) {
    const { eventKey, snapshotAt, registrations, contestProjects, personalProjects } = manifest;
    if (
        typeof eventKey !== "string" ||
        !eventKey ||
        typeof snapshotAt !== "string" ||
        !Number.isFinite(Date.parse(snapshotAt)) ||
        !Array.isArray(registrations) ||
        !Array.isArray(contestProjects) ||
        !Array.isArray(personalProjects)
    )
        fail("Invalid inventory manifest");
    const current = await db.all(
        "SELECT id,name,major,grade,form_data_json FROM hackathon_registrations WHERE event_key=?",
        [eventKey]
    );
    const expected = new Map(registrations.map((r) => [r.id, r.hash]));
    if (
        expected.size !== registrations.length ||
        expected.size !== current.length ||
        current.some((r) => expected.get(r.id) !== registrationFingerprint(r))
    )
        fail("Registration source changed; rebuild the reviewed manifest");
    const validate = (rows) => {
        const keys = new Set();
        for (const row of rows) {
            if (typeof row.key !== "string" || !row.key || keys.has(row.key))
                fail("Duplicate or invalid project key");
            keys.add(row.key);
            for (const field of ["title", "discipline", "industry"])
                if (typeof row[field] !== "string" || row[field].length > 500)
                    fail("Invalid project field");
        }
    };
    validate(contestProjects);
    validate(personalProjects);
    for (const p of contestProjects) {
        if (
            !["campus", "industry"].includes(p.track) ||
            typeof p.team !== "string" ||
            !p.team ||
            !["brief", "material", "unknown"].includes(p.evidenceKind) ||
            !Array.isArray(p.evidence?.registrationIds) ||
            !p.evidence.registrationIds.length ||
            p.evidence.registrationIds.some((id) => !expected.has(id))
        )
            fail("Invalid contest project evidence");
    }
    for (const p of personalProjects) {
        if (
            !p.title.trim() ||
            !Array.isArray(p.members) ||
            !p.members.length ||
            new Set(p.members.map((m) => m.registrationId)).size !== p.members.length ||
            p.members.some(
                (m) =>
                    !expected.has(m.registrationId) ||
                    !Array.isArray(m.sources) ||
                    !m.sources.length
            )
        )
            fail("Personal projects require explicit, same-event registration evidence");
    }
    // Full reviewed snapshots are replaced atomically. Unrelated events and all original
    // registration/submission/profile data remain untouched; stable keys retain row IDs.
    for (const p of contestProjects)
        await db.run(
            `INSERT INTO hackathon_registration_projects
            (event_key,source_key,track,team_name,title,discipline,industry,evidence_kind,evidence_json,snapshot_at)
            VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_key,source_key) DO UPDATE SET
            track=excluded.track,team_name=excluded.team_name,title=excluded.title,discipline=excluded.discipline,
            industry=excluded.industry,evidence_kind=excluded.evidence_kind,evidence_json=excluded.evidence_json,snapshot_at=excluded.snapshot_at`,
            [
                eventKey,
                p.key,
                p.track,
                p.team,
                p.title,
                p.discipline,
                p.industry,
                p.evidenceKind,
                json(p.evidence),
                snapshotAt,
            ]
        );
    for (const p of personalProjects) {
        await db.run(
            `INSERT INTO hackathon_personal_projects(event_key,source_key,title,discipline,industry,notes,snapshot_at)
            VALUES(?,?,?,?,?,?,?) ON CONFLICT(event_key,source_key) DO UPDATE SET title=excluded.title,
            discipline=excluded.discipline,industry=excluded.industry,notes=excluded.notes,snapshot_at=excluded.snapshot_at`,
            [eventKey, p.key, p.title, p.discipline, p.industry, p.notes || "", snapshotAt]
        );
        const { id } = await db.get(
            "SELECT id FROM hackathon_personal_projects WHERE event_key=? AND source_key=?",
            [eventKey, p.key]
        );
        await db.run("DELETE FROM hackathon_personal_project_members WHERE project_id=?", [id]);
        for (const m of p.members)
            await db.run(
                "INSERT INTO hackathon_personal_project_members(project_id,registration_id,evidence_json) VALUES(?,?,?)",
                [id, m.registrationId, json(m.sources)]
            );
    }
    for (const [table, rows] of [
        ["hackathon_registration_projects", contestProjects],
        ["hackathon_personal_projects", personalProjects],
    ]) {
        const keys = new Set(rows.map((p) => p.key));
        for (const stored of await db.all(`SELECT id,source_key FROM ${table} WHERE event_key=?`, [
            eventKey,
        ]))
            if (!keys.has(stored.source_key))
                await db.run(`DELETE FROM ${table} WHERE id=?`, [stored.id]);
    }
    return {
        fingerprint: hash(json(manifest)),
        contestProjects: contestProjects.length,
        personalProjects: personalProjects.length,
        personalMembers: new Set(
            personalProjects.flatMap((p) => p.members.map((m) => m.registrationId))
        ).size,
        personalLinks: personalProjects.reduce((sum, p) => sum + p.members.length, 0),
    };
}

function distribution(rows, field) {
    const counts = new Map();
    for (const row of rows) counts.set(row[field], (counts.get(row[field]) || 0) + 1);
    return [...counts]
        .map(([label, count]) => ({
            label,
            count,
            percent: rows.length ? Math.round((count / rows.length) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function readProjectInventory(db, eventKey, kind, registrationId) {
    if (kind !== "contest" && kind !== "personal") fail("Invalid inventory kind");
    if (kind === "contest") {
        const rows = (
            await db.all(
                "SELECT * FROM hackathon_registration_projects WHERE event_key=? ORDER BY track,id",
                [eventKey]
            )
        ).map((r) => ({
            id: r.id,
            track: r.track,
            team: r.team_name,
            title: r.title,
            discipline: r.discipline,
            industry: r.industry,
            evidenceKind: r.evidence_kind,
            evidence: JSON.parse(r.evidence_json),
            snapshotAt: r.snapshot_at,
        }));
        return {
            eventKey,
            kind,
            rows,
            summary: {
                total: rows.length,
                industry: rows.filter((r) => r.track === "industry").length,
                campus: rows.filter((r) => r.track === "campus").length,
                unknown: rows.filter((r) => r.evidenceKind === "unknown").length,
                disciplines: distribution(rows, "discipline"),
                industries: distribution(rows, "industry"),
            },
        };
    }
    const members = await db.all(
        `SELECT m.project_id,m.registration_id,m.evidence_json,r.name,r.grade,r.major
        FROM hackathon_personal_project_members m JOIN hackathon_registrations r ON r.id=m.registration_id
        JOIN hackathon_personal_projects p ON p.id=m.project_id WHERE p.event_key=? AND r.event_key=?`,
        [eventKey, eventKey]
    );
    const rows = (
        await db.all("SELECT * FROM hackathon_personal_projects WHERE event_key=? ORDER BY id", [
            eventKey,
        ])
    )
        .map((r) => ({
            id: r.id,
            title: r.title,
            discipline: r.discipline,
            industry: r.industry,
            notes: r.notes,
            snapshotAt: r.snapshot_at,
            members: members
                .filter((m) => m.project_id === r.id)
                .map((m) => ({
                    registrationId: m.registration_id,
                    name: m.name,
                    grade: m.grade,
                    major: m.major,
                    sources: JSON.parse(m.evidence_json),
                })),
        }))
        .filter(
            (r) => !registrationId || r.members.some((m) => m.registrationId === registrationId)
        );
    const profiles = (
        await db.all(
            "SELECT id,name,grade,major,form_data_json FROM hackathon_registrations WHERE event_key=? ORDER BY id",
            [eventKey]
        )
    )
        .filter((r) => !registrationId || r.id === registrationId)
        .map((r) => {
            const form = JSON.parse(r.form_data_json || "{}");
            const entries = Object.entries(trackRegistrations(form));
            const sources = [];
            for (const [track, entry] of entries.length
                ? entries
                : [["registration", { answers: form }]])
                for (const field of ["experience", "researchExperience", "projectLinks"])
                    if (typeof entry.answers[field] === "string" && entry.answers[field].trim())
                        sources.push({ track, field, text: entry.answers[field] });
            const projects = rows.filter((p) => p.members.some((m) => m.registrationId === r.id));
            return {
                id: r.id,
                name: r.name,
                major: r.major,
                grade: r.grade,
                sources,
                projectCount: projects.length,
                projectTitles: projects.map((p) => p.title),
                status: projects.length ? "structured" : sources.length ? "textOnly" : "blank",
            };
        });
    return {
        eventKey,
        kind,
        rows,
        profiles,
        summary: {
            total: rows.length,
            people: profiles.filter((p) => p.projectCount > 0).length,
            registrations: profiles.length,
            filled: profiles.filter((p) => p.sources.length > 0).length,
            textOnly: profiles.filter((p) => p.status === "textOnly").length,
            blank: profiles.filter((p) => p.status === "blank").length,
            links: rows.reduce((sum, r) => sum + r.members.length, 0),
            disciplines: distribution(rows, "discipline"),
            industries: distribution(rows, "industry"),
        },
    };
}
module.exports = { registrationFingerprint, importProjectInventory, readProjectInventory };
