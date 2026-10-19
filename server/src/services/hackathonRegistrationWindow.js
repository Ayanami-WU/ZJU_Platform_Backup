const registrationOpen = (template, now = Date.now(), track) => {
    const { event, navigation } = template;
    const program = event.program || {};
    const endAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(event.endAt || "")
        ? `${event.endAt}:00+08:00`
        : event.endAt;
    if (
        !navigation.registrationVisible ||
        !event.registrationOpen ||
        (endAt && now >= Date.parse(endAt)) ||
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
module.exports = { registrationOpen };
