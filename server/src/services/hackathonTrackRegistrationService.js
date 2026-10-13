const { AIX_EVENT_KEY } = require("./hackathonRepositoryService");
const TRACKS = ["industry", "campus"];

// Legacy registrations keep their exact submitted answers, including joint entries.
const trackRegistrations = (answers, createdAt) => {
    if (answers?.trackRegistrations && typeof answers.trackRegistrations === "object") {
        return Object.fromEntries(
            TRACKS.filter((key) => answers.trackRegistrations[key]?.answers).map((key) => [
                key,
                answers.trackRegistrations[key],
            ])
        );
    }
    const selected = Array.isArray(answers?.track) ? answers.track : [answers?.track];
    return Object.fromEntries(
        TRACKS.filter((key) => selected.includes(key)).map((key) => [
            key,
            { answers: { ...answers, track: [key] }, createdAt, legacy: true },
        ])
    );
};
const decode = (row) => JSON.parse(row.form_data_json || "{}");
const registrationPayload = (row) => {
    if (!row) return null;
    const answers = decode(row);
    return {
        id: row.id,
        eventKey: row.event_key,
        answers,
        createdAt: row.created_at,
        ...(row.event_key === AIX_EVENT_KEY
            ? { trackRegistrations: trackRegistrations(answers, row.created_at) }
            : {}),
    };
};
const conflict = (code, message) => Object.assign(new Error(message), { status: 409, code });

async function saveTrackRegistration(db, { userId, template, answers }) {
    const selected = Array.isArray(answers.track) ? answers.track : [answers.track];
    if (
        !selected.length ||
        selected.some((key) => !TRACKS.includes(key)) ||
        new Set(selected).size !== selected.length
    ) {
        throw Object.assign(new Error("请选择有效的报名赛道"), {
            status: 400,
            code: "HACKATHON_REGISTRATION_INVALID",
        });
    }
    if (selected.length === 1 && selected[0] === "industry") {
        answers = { ...answers, team: "", teamSize: "1" };
        delete answers.isCaptain;
    }
    const createdAt = new Date().toISOString();
    for (let attempt = 0; attempt < 4; attempt++) {
        const row = await db.get(
            "SELECT * FROM hackathon_registrations WHERE event_key=? AND user_id=?",
            [AIX_EVENT_KEY, userId]
        );
        const previous = row ? decode(row) : {};
        const entries = row ? trackRegistrations(previous, row.created_at) : {};
        const studentId = String(answers.studentId).trim().toLowerCase();
        const sameStudent = await db.get(
            "SELECT id FROM hackathon_registrations WHERE event_key=? AND student_id=?",
            [AIX_EVENT_KEY, studentId]
        );
        if (sameStudent && sameStudent.id !== row?.id)
            throw conflict("HACKATHON_ALREADY_REGISTERED", "该学号已报名，请使用原账号");
        for (const key of selected) {
            const trackAnswers = { ...answers, track: [key] };
            if (key === "industry") {
                trackAnswers.team = "";
                trackAnswers.teamSize = "1";
                delete trackAnswers.isCaptain;
            }
            entries[key] = {
                answers: trackAnswers,
                createdAt: entries[key]?.createdAt || createdAt,
            };
        }
        // Top-level track remains the eligibility union used by existing submission permissions.
        const merged = {
            ...previous,
            ...answers,
            track: TRACKS.filter((key) => entries[key]),
            trackRegistrations: entries,
        };
        if (selected.length === 1 && selected[0] === "industry") delete merged.isCaptain;
        if (row) {
            const update = await db.run(
                "UPDATE hackathon_registrations SET form_data_json=?,name=?,student_id=?,major=?,grade=?,ai_tools=?,experience=?,template_revision=? WHERE id=? AND user_id=? AND form_data_json=?",
                [
                    JSON.stringify(merged),
                    answers.name,
                    studentId,
                    answers.major,
                    answers.grade,
                    JSON.stringify(answers.aiTools || []),
                    answers.experience || "",
                    template.revision,
                    row.id,
                    userId,
                    row.form_data_json,
                ]
            );
            if (!update.changes) continue;
            return { ...row, form_data_json: JSON.stringify(merged) };
        }
        try {
            const result = await db.run(
                `INSERT INTO hackathon_registrations (event_key,name,student_id,major,grade,ai_tools,experience,form_data_json,template_revision,created_at,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    AIX_EVENT_KEY,
                    answers.name,
                    studentId,
                    answers.major,
                    answers.grade,
                    JSON.stringify(answers.aiTools || []),
                    answers.experience || "",
                    JSON.stringify(merged),
                    template.revision,
                    createdAt,
                    userId,
                ]
            );
            return {
                id: result.lastID,
                event_key: AIX_EVENT_KEY,
                form_data_json: JSON.stringify(merged),
                created_at: createdAt,
            };
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT" || error.code?.startsWith("SQLITE_CONSTRAINT_"))
                continue;
            throw error;
        }
    }
    throw conflict("HACKATHON_REGISTRATION_CONFLICT", "报名状态已更新，请刷新后重试");
}
module.exports = { trackRegistrations, registrationPayload, saveTrackRegistration };
