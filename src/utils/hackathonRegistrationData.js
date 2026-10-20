import { rosterDate } from "./hackathonRoster";
import { formatHackathonAnswer } from "../data/hackathonTemplate";
import {
    registrationSubmissionAnswers,
    registrationSubmissionField,
} from "./hackathonRegistrationSubmissions";

const gradeLabels = {
    freshman: "大一",
    sophomore: "大二",
    junior: "大三",
    senior: "大四",
    master: "硕士",
    phd: "博士",
};

const aiToolLabels = {
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
    trae: "Trae",
    other: "其他",
};

const safeParseTools = (value) => {
    try {
        const parsed = JSON.parse(value || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const escapeCsv = (value) => {
    const text = String(value ?? "");
    // CSV files are opened in spreadsheets; treat user-supplied formulas as text.
    return (/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replace(/"/g, '""');
};

const fallbackRegistrationFields = [
    { id: "name", label: "姓名" },
    { id: "studentId", label: "学号" },
    { id: "major", label: "专业" },
    {
        id: "grade",
        label: "年级",
        options: Object.entries(gradeLabels).map(([value, label]) => ({ value, label })),
    },
    {
        id: "aiTools",
        label: "AI 工具",
        options: Object.entries(aiToolLabels).map(([value, label]) => ({ value, label })),
    },
    { id: "experience", label: "项目经验" },
];

export const registrationAnswers = (registration) => {
    const entries = registration.form_data?.trackRegistrations;
    const trackAnswers = {};
    if (entries) {
        for (const track of ["industry", "campus"]) {
            const entry = entries[track];
            if (!entry?.answers) continue;
            for (const [id, value] of Object.entries(entry.answers)) {
                if (id !== "trackRegistrations") trackAnswers[`${track}__${id}`] = value;
            }
            trackAnswers[`${track}__submittedAt`] = entry.createdAt;
        }
    }
    const answers = {
        githubRepository: registration.github_repository_url || "",
        modelscopeRepository: registration.modelscope_repository_url || "",
        repositoriesUpdatedAt: registration.repositories_updated_at || "",
        name: registration.name,
        studentId: registration.student_id,
        major: registration.major,
        grade: registration.grade,
        aiTools: safeParseTools(registration.ai_tools),
        experience: registration.experience,
        ...(registration.form_data &&
        typeof registration.form_data === "object" &&
        !Array.isArray(registration.form_data)
            ? registration.form_data
            : {}),
        ...trackAnswers,
        ...registrationSubmissionAnswers(registration),
    };
    delete answers.trackRegistrations;
    return answers;
};

export const registrationFieldsByEvent = (events) =>
    new Map(
        events.map((item) => [
            item.event.key,
            new Map(
                [...fallbackRegistrationFields, ...(item.form?.fields || [])].map((field) => [
                    field.id,
                    field,
                ])
            ),
        ])
    );
const fallbackFieldsById = new Map(
    [
        ...fallbackRegistrationFields,
        { id: "githubRepository", label: "GitHub 仓库" },
        { id: "modelscopeRepository", label: "魔搭社区仓库" },
        { id: "repositoriesUpdatedAt", label: "仓库提交时间" },
    ].map((field) => [field.id, field])
);
export const registrationField = (fieldsByEvent, eventKey, fieldId) => {
    const submissionField = registrationSubmissionField(fieldId);
    if (submissionField) return submissionField;
    const match = /^(industry|campus)__(.+)$/.exec(fieldId);
    if (match) {
        const field =
            match[2] === "submittedAt"
                ? { label: "提交时间" }
                : registrationField(fieldsByEvent, eventKey, match[2]);
        return {
            ...field,
            id: fieldId,
            label: `${match[1] === "industry" ? "华为产业落地赛道" : "天猫OPC孵化赛道"} · ${field.label}`,
        };
    }
    return (
        fieldsByEvent.get(eventKey)?.get(fieldId) ||
        fallbackFieldsById.get(fieldId) || { id: fieldId, label: fieldId }
    );
};

export const registrationExportTable = (registrations, events, eventFilter) => {
    const fieldsByEvent = registrationFieldsByEvent(events);
    const eventTitles = new Map(events.map((item) => [item.event.key, item.event.title]));
    const scopedEvents = eventFilter
        ? events.filter((item) => item.event.key === eventFilter)
        : events;
    const columns = new Map();
    const addColumn = (field) => columns.set(JSON.stringify([field.id, field.label]), field);
    const configured = scopedEvents
        .flatMap((item) => item.form?.fields || [])
        .filter((field) => field.enabled !== false);
    (configured.length ? configured : fallbackRegistrationFields).forEach(addColumn);
    // Preserve answers from retired/disabled fields and editions absent from current configuration.
    registrations.forEach((registration) => {
        Object.entries(registrationAnswers(registration)).forEach(([id, value]) => {
            if (
                value !== undefined &&
                value !== null &&
                value !== "" &&
                (!Array.isArray(value) || value.length)
            )
                addColumn(registrationField(fieldsByEvent, registration.event_key, id));
        });
    });
    const exportFields = [...columns.values()];
    const labels = exportFields.map((field) => field.label);
    const headers = [
        "比赛日程",
        ...exportFields.map((field) =>
            labels.filter((label) => label === field.label).length > 1
                ? `${field.label} (${field.id})`
                : field.label
        ),
        "报名时间",
    ];
    const rows = registrations.map((registration) => {
        const answers = registrationAnswers(registration);
        return [
            eventTitles.get(registration.event_key) || registration.event_key || "历史赛事",
            ...exportFields.map((column) => {
                const field = registrationField(fieldsByEvent, registration.event_key, column.id);
                return field.label === column.label
                    ? formatHackathonAnswer(answers[column.id], field)
                    : "";
            }),
            formatDateTime(registration.created_at),
        ];
    });
    return [headers, ...rows];
};

const formatDateTime = (value) => rosterDate(value);
