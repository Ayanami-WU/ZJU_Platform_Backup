const crypto = require("node:crypto");
const { activeTrackRegistrations } = require("./hackathonTrackRegistrationService");
const { AIX_EVENT_KEY } = require("./hackathonRepositoryService");
const digest = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const clean = (value) => String(value ?? "").trim();
const phone = (value) =>
    clean(value)
        .replace(/\D/g, "")
        .replace(/^86(?=\d{11}$)/, "");
const parse = (value) => JSON.parse(value || "{}");

// Called only by the operator CLI, never by an unauthenticated HTTP request.
// The caller owns the transaction; preview uses exactly this path then rolls back.
async function importHackathonRecords(db, input, { stamp = new Date().toISOString() } = {}) {
    if (
        input.eventKey !== AIX_EVENT_KEY ||
        !["campus", "industry"].includes(input.track) ||
        !["initial", "semifinal"].includes(input.stage) ||
        !/^[a-f0-9]{64}$/.test(input.sourceHash || "") ||
        !Array.isArray(input.rows) ||
        !input.rows.length ||
        input.rows.length > 1000
    )
        throw new Error("Invalid import manifest");
    const seen = new Set();
    for (const row of input.rows) {
        if (
            !Number.isSafeInteger(row.row) ||
            row.row < 2 ||
            seen.has(row.row) ||
            !clean(row.name) ||
            !row.materials ||
            typeof row.materials !== "object" ||
            Array.isArray(row.materials) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(row.submittedDate || "") ||
            !Number.isFinite(Date.parse(row.submittedDate))
        )
            throw new Error("Invalid or duplicate source row");
        seen.add(row.row);
    }
    const registrations = await db.all(
        "SELECT * FROM hackathon_registrations WHERE event_key=? ORDER BY id",
        [input.eventKey]
    );
    const result = { inserted: 0, skipped: 0, linked: 0, registrationsCreated: 0, entries: [] };
    for (const row of input.rows) {
        const recordKey = digest([input.sourceHash, input.sheet, row.row]);
        const contentHash = digest(row);
        const existing = await db.get(
            "SELECT id,registration_id,provenance_json FROM hackathon_submissions WHERE event_key=? AND track=? AND stage=? AND record_key=?",
            [input.eventKey, input.track, input.stage, recordKey]
        );
        if (existing) {
            if (parse(existing.provenance_json).contentHash !== contentHash)
                throw new Error("Source row changed under an existing import key");
            result.skipped++;
            result.entries.push({
                row: row.row,
                submissionId: existing.id,
                registrationId: existing.registration_id,
                action: "skip",
            });
            continue;
        }
        const matches = registrations.filter((registration) => {
            const a = parse(registration.form_data_json);
            const answer = a.trackRegistrations?.[input.track]?.answers || a;
            const names = [registration.name, a.name, answer.name].map(clean);
            const contacts = [a.contact, answer.contact].map(phone).filter(Boolean);
            return (
                phone(row.contact) &&
                names.includes(clean(row.name)) &&
                contacts.includes(phone(row.contact))
            );
        });
        let registration = matches.length === 1 ? matches[0] : null;
        if (registration) result.linked++;
        else {
            const answers = {
                name: clean(row.name),
                studentId: "",
                major: "",
                grade: "",
                aiTools: [],
                contact: clean(row.contact),
                wechat: clean(row.wechat),
                team: clean(row.teamName),
                teamSize: row.teamSize ?? "",
                isCaptain: "yes",
                track: [input.track],
            };
            const form = {
                ...answers,
                trackRegistrations: {
                    [input.track]: { answers, createdAt: row.submittedDate, active: true },
                },
            };
            const saved = await db.run(
                "INSERT INTO hackathon_registrations(event_key,name,student_id,major,grade,ai_tools,form_data_json,created_at,user_id) VALUES(?,?,NULL,NULL,NULL,?,?,?,NULL)",
                [input.eventKey, answers.name, "[]", JSON.stringify(form), row.submittedDate]
            );
            registration = await db.get("SELECT * FROM hackathon_registrations WHERE id=?", [
                saved.lastID,
            ]);
            registrations.push(registration);
            result.registrationsCreated++;
        }
        const snapshot = {
            ...row.materials,
            projectName: clean(row.materials.projectName),
            teamName: clean(row.teamName),
            teamSize: row.teamSize ?? null,
            captainName: clean(row.name),
            contact: clean(row.contact),
            wechat: clean(row.wechat),
            submittedDatePrecision: "day",
            bpFileId: null,
            demoFileId: null,
        };
        const provenance = {
            sourceHash: input.sourceHash,
            sheet: input.sheet,
            row: row.row,
            contentHash,
            importedAt: stamp,
            raw: row.raw || {},
            linkedBy: matches.length === 1 ? "name_and_phone" : null,
            activeTrackAtImport: Boolean(
                activeTrackRegistrations(
                    parse(registration.form_data_json),
                    registration.created_at
                )[input.track]
            ),
        };
        const saved = await db.run(
            "INSERT INTO hackathon_submissions(event_key,user_id,registration_id,track,stage,record_key,provenance_json,draft_json,draft_updated_at,submitted_json,submitted_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            [
                input.eventKey,
                registration.user_id,
                registration.id,
                input.track,
                input.stage,
                recordKey,
                JSON.stringify(provenance),
                "{}",
                stamp,
                JSON.stringify(snapshot),
                row.submittedDate,
            ]
        );
        result.inserted++;
        result.entries.push({
            row: row.row,
            submissionId: saved.lastID,
            registrationId: registration.id,
            action: matches.length === 1 ? "link" : "create",
        });
    }
    result.fingerprint = digest(result.entries);
    return result;
}
module.exports = { importHackathonRecords };
