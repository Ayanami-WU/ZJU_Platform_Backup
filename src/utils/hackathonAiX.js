export const AIX_EVENT_KEY = "zhekesong-ai-x-2026";
export const AIX_VIEWS = ["intro", "challenges", "media", "results"];
export const resolveAiXView = (view) =>
    AIX_VIEWS.includes(view) ? view : view === "showcase" ? "results" : "intro";
export const stageState = (stage, now = Date.now()) => {
    if (now < Date.parse(stage.opensAt)) return "upcoming";
    if (now >= Date.parse(stage.closesAt)) return "ended";
    return "live";
};
export const currentStage = (stages, now = Date.now()) =>
    stages.find((stage) => stageState(stage, now) === "live") ||
    stages.find((stage) => stageState(stage, now) === "upcoming") ||
    stages.at(-1);
export const registrationOpen = (template, now = Date.now(), track) => {
    const { event, navigation } = template;
    const program = event.program || {};
    if (
        !navigation.registrationVisible ||
        !event.registrationOpen ||
        (event.endAt && now >= eventTimestamp(event.endAt)) ||
        (program.registrationOpensAt && now < Date.parse(program.registrationOpensAt))
    )
        return false;
    const tracks = program.trackRegistration;
    if (!track && tracks && Object.keys(tracks).length)
        return ["campus", "industry"].some((key) => registrationOpen(template, now, key));
    const config = track ? tracks?.[track] : undefined;
    const closesAt = config?.closesAt || program.registrationClosesAt;
    return config?.enabled !== false && (!closesAt || now < Date.parse(closesAt));
};
export const safeWebUrl = (value) => {
    if (typeof value === "string") {
        const normalized = value.trim();
        const safeAsset =
            normalized.startsWith("/") &&
            !normalized.startsWith("//") &&
            !/[<>"']/.test(normalized) &&
            [...normalized].every((character) => character.charCodeAt(0) > 0x20);
        if (safeAsset) return normalized;
    }
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
};

// Editor date/time values represent the event’s Asia/Shanghai time zone.
export const eventTimestamp = (value) =>
    Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "") ? `${value}:00+08:00` : value);
