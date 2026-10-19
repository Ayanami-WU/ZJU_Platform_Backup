const { createHash } = require("node:crypto");
const { activeTrackRegistrations } = require("./hackathonTrackRegistrationService");

const invalid = (message, status = 400) => {
    throw Object.assign(new Error(message), { status, code: "HACKATHON_QUALIFICATION_REVIEW" });
};

// The administrator supplies an explicitly reviewed account roster. Never infer teammates here.
async function reviewQualificationMembers(db, eventKey, members) {
    if (!Array.isArray(members) || !members.length || members.length > 500)
        invalid("请提供 1—500 位已核实的晋级成员");
    const registrations = await db.all("SELECT * FROM hackathon_registrations WHERE event_key=?", [
        eventKey,
    ]);
    const candidates = registrations.flatMap((row) => {
        const entry = activeTrackRegistrations(
            JSON.parse(row.form_data_json || "{}"),
            row.created_at
        ).industry;
        if (!entry) return [];
        return [
            {
                registrationId: row.id,
                userId: row.user_id,
                studentId: String(entry.answers.studentId || row.student_id || "")
                    .trim()
                    .toLowerCase(),
                name: String(entry.answers.name || row.name || "").trim(),
                teamName: String(entry.answers.team || "").trim(),
            },
        ];
    });
    const seen = new Set();
    const resolved = members.map((member) => {
        if (
            !member ||
            typeof member !== "object" ||
            typeof member.studentId !== "string" ||
            !member.studentId.trim() ||
            typeof member.name !== "string" ||
            !member.name.trim() ||
            typeof member.teamName !== "string" ||
            member.studentId.length > 160 ||
            member.name.length > 160 ||
            member.teamName.length > 160
        )
            invalid("每位成员须包含学号、姓名和已核实队名（无队名须显式填空）");
        const studentId = member.studentId.trim().toLowerCase();
        if (seen.has(studentId)) invalid(`名单中出现重复学号：${studentId}`);
        seen.add(studentId);
        const matches = candidates.filter((row) => row.studentId === studentId);
        if (matches.length !== 1)
            invalid(`${member.name} 的有效华为报名无法唯一匹配，请重新核对`, 409);
        const row = matches[0];
        if (
            !Number.isSafeInteger(row.userId) ||
            row.userId <= 0 ||
            row.name !== member.name.trim() ||
            row.teamName !== member.teamName.trim()
        )
            invalid(`${member.name} 的账号、姓名或队名与核实名单不一致，请重新核对`, 409);
        return row;
    });
    if (new Set(resolved.map((row) => row.userId)).size !== resolved.length)
        invalid("多个名单条目关联同一账号，请核对", 409);
    const qualifications = await db.all(
        "SELECT * FROM hackathon_submission_qualifications WHERE event_key=? AND track='industry'",
        [eventKey]
    );
    const rows = resolved.map((row) => {
        const current = qualifications.find((item) => item.user_id === row.userId);
        return {
            ...row,
            qualified: current?.qualified === 1,
            updatedAt: current?.updated_at || null,
        };
    });
    const fingerprint = createHash("sha256")
        .update(JSON.stringify({ eventKey, rows }))
        .digest("hex");
    return { rows, fingerprint };
}

module.exports = { reviewQualificationMembers };
