const { createHackathonSubmissionService } = require("../services/hackathonSubmissionService");
const service = createHackathonSubmissionService();
const handler = (fn) => async (req, res, next) => {
    try {
        if (!req.user?.id)
            return res.status(401).json({ code: "HACKATHON_LOGIN_REQUIRED", error: "请先登录" });
        res.setHeader("Cache-Control", "no-store");
        res.json(await fn(req));
    } catch (error) {
        if (error.status)
            return res.status(error.status).json({
                code: error.code,
                error: error.message,
                ...(error.field ? { field: error.field } : {}),
                ...(error.reason ? { reason: error.reason } : {}),
            });
        next(error);
    }
};
const fs = require("node:fs/promises");
const path = require("node:path");
const { isPlatformAdmin } = require("../utils/userPermissions");
const {
    PRIVATE_FILES_DIR,
    inspectSubmissionFile,
} = require("../services/hackathonSubmissionFileService");
module.exports = {
    uploadFile: handler(async (req) => {
        try {
            const file = await inspectSubmissionFile(req.file, req.body?.kind);
            return await service.addFile(req.user.id, req.body || {}, file);
        } catch (error) {
            if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
            throw error;
        }
    }),
    downloadFile: async (req, res, next) => {
        try {
            const row = await service.getFile(
                req.user.id,
                Number(req.params.id),
                isPlatformAdmin(req.user)
            );
            res.setHeader("Cache-Control", "private, no-store");
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("Content-Type", row.mime_type);
            res.download(
                path.join(PRIVATE_FILES_DIR, row.storage_name),
                row.original_name,
                (error) => {
                    if (error && !res.headersSent) next(error);
                }
            );
        } catch (error) {
            if (error.status)
                return res.status(error.status).json({ code: error.code, error: error.message });
            next(error);
        }
    },
    getMine: handler((req) => service.getMine(req.user.id, req.query.event)),
    save: handler((req) => service.save(req.user.id, req.body || {})),
    getRoster: handler((req) => service.getRoster(req.query.event)),
    setQualification: handler((req) => service.setQualification(req.user.id, req.body || {})),
    batchQualify: handler((req) => service.batchQualify(req.user.id, req.body || {})),
};
