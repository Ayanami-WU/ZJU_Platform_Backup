const { getDb } = require("../config/db");
const { readProjectInventory } = require("../services/hackathonProjectInventoryService");
const { isPlatformAdmin } = require("../utils/userPermissions");

exports.getInventory = async (req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    if (!isPlatformAdmin(req.user)) return res.status(403).json({ error: "Forbidden" });
    const { event, kind, registrationId } = req.query;
    if (
        typeof event !== "string" ||
        !event ||
        event.length > 120 ||
        !["contest", "personal"].includes(kind) ||
        (registrationId !== undefined && !/^[1-9]\d*$/.test(registrationId))
    )
        return res.status(400).json({ error: "Invalid inventory filters" });
    try {
        res.json(
            await readProjectInventory(
                await getDb(),
                event,
                kind,
                registrationId ? Number(registrationId) : undefined
            )
        );
    } catch (error) {
        next(error);
    }
};
