const { getDb } = require("../config/db");
const config = require("../../../shared/hackathonForums.json");
const toRegistration = (row) => ({
    id: row.id,
    forumKey: row.forum_key,
    name: row.name,
    contact: row.contact,
    organization: row.organization,
    attendeeType: row.attendee_type || "",
    studentId: row.student_id || "",
    major: row.major || "",
    grade: row.grade || "",
    question: row.question || "",
    school: row.school || "",
    projectExperience: row.project_experience || "",
    researchExperience: row.research_experience || "",
    aiCapabilities: row.ai_capabilities || "",
    createdAt: row.created_at,
});
const clean = (value, limit) =>
    typeof value === "string" && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value)
        ? value.trim()
        : "";
const cleanAnswer = (value) =>
    typeof value === "string" &&
    value.length <= 2000 &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
        ? value.trim()
        : "";
const getMyForums = async (req, res, next) => {
    try {
        const db = await getDb();
        const rows = await db.all(
            "SELECT * FROM hackathon_forum_registrations WHERE event_key=? AND user_id=? ORDER BY forum_key",
            [config.eventKey, req.user.id]
        );
        res.setHeader("Cache-Control", "no-store");
        res.json({ registrations: rows.map(toRegistration) });
    } catch (e) {
        next(e);
    }
};
const registerForums = async (req, res, next) => {
    try {
        const {
            sessions,
            name: rawName,
            contact: rawContact,
            organization: rawOrganization,
            attendeeType,
            studentId: rawStudentId,
            major: rawMajor,
            grade: rawGrade,
            question: rawQuestion,
            school: rawSchool,
            projectExperience: rawProjectExperience,
            researchExperience: rawResearchExperience,
            aiCapabilities: rawAiCapabilities,
        } = req.body || {};
        const name = clean(rawName, 80),
            contact = clean(rawContact, 120),
            organization = clean(rawOrganization || "", 160);
        const studentId = clean(rawStudentId, 80);
        const major = clean(rawMajor, 160);
        const grade = clean(rawGrade, 80);
        const school = clean(rawSchool, 160);
        const projectExperience = cleanAnswer(rawProjectExperience);
        const researchExperience = cleanAnswer(rawResearchExperience);
        const aiCapabilities = cleanAnswer(rawAiCapabilities);
        const question = cleanAnswer(rawQuestion);
        if (
            !Array.isArray(sessions) ||
            !sessions.length ||
            sessions.length > 2 ||
            new Set(sessions).size !== sessions.length ||
            sessions.some((key) => !config.sessions.some((s) => s.key === key))
        )
            return res
                .status(400)
                .json({ error: "请选择有效的论坛场次", code: "FORUM_INVALID_SESSION" });
        if (
            !name ||
            !contact ||
            !/^(?:\+?86[ -]?)?1[3-9]\d{9}$/.test(contact) ||
            !["internal", "external"].includes(attendeeType) ||
            (attendeeType === "internal" && !studentId) ||
            !major ||
            !grade ||
            (attendeeType === "external" && !school) ||
            !projectExperience ||
            !researchExperience ||
            !aiCapabilities ||
            !question ||
            (rawOrganization && !organization)
        )
            return res.status(400).json({
                error: "请填写有效手机号及对应身份的必填信息",
                code: "FORUM_INVALID_DETAILS",
            });
        const now = Date.now();
        if (
            now < Date.parse(config.registrationOpensAt) ||
            sessions.some(
                (key) => now >= Date.parse(config.sessions.find((s) => s.key === key).startsAt)
            )
        )
            return res
                .status(403)
                .json({ error: "所选论坛报名未开放或已截止", code: "FORUM_REGISTRATION_CLOSED" });
        const db = await getDb();
        const values = sessions.flatMap((key) => [
            config.eventKey,
            key,
            req.user.id,
            name,
            contact,
            organization,
            attendeeType,
            studentId,
            major,
            grade,
            question,
            school,
            projectExperience,
            researchExperience,
            aiCapabilities,
        ]);
        // One atomic statement: repeat submissions update the same account/session receipt.
        await db.run(
            `INSERT INTO hackathon_forum_registrations(event_key,forum_key,user_id,name,contact,organization,attendee_type,student_id,major,grade,question,school,project_experience,research_experience,ai_capabilities) VALUES ${sessions.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",")} ON CONFLICT(event_key,user_id,forum_key) DO UPDATE SET name=excluded.name,contact=excluded.contact,organization=excluded.organization,attendee_type=excluded.attendee_type,student_id=excluded.student_id,major=excluded.major,grade=excluded.grade,question=excluded.question,school=excluded.school,project_experience=excluded.project_experience,research_experience=excluded.research_experience,ai_capabilities=excluded.ai_capabilities,updated_at=CURRENT_TIMESTAMP`,
            values
        );
        return getMyForums(req, res, next);
    } catch (e) {
        next(e);
    }
};
const cancelForum = async (req, res, next) => {
    try {
        const session = config.sessions.find((s) => s.key === req.params.forumKey);
        if (!session) return res.status(404).json({ error: "论坛不存在" });
        if (Date.now() >= Date.parse(session.startsAt))
            return res
                .status(403)
                .json({ error: "论坛报名已截止，无法在线取消", code: "FORUM_REGISTRATION_CLOSED" });
        const db = await getDb();
        await db.run(
            "DELETE FROM hackathon_forum_registrations WHERE event_key=? AND user_id=? AND forum_key=?",
            [config.eventKey, req.user.id, session.key]
        );
        return getMyForums(req, res, next);
    } catch (e) {
        next(e);
    }
};
const getForumRoster = async (req, res, next) => {
    try {
        const db = await getDb();
        const rows = await db.all(
            "SELECT * FROM hackathon_forum_registrations WHERE event_key=? ORDER BY forum_key,created_at,id",
            [config.eventKey]
        );
        res.setHeader("Cache-Control", "no-store");
        res.json({
            registrations: rows.map((row) => ({ ...toRegistration(row), userId: row.user_id })),
        });
    } catch (e) {
        next(e);
    }
};
module.exports = { getMyForums, registerForums, cancelForum, getForumRoster };
