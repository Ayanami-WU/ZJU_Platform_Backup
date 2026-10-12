const multer = require("multer");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { PRIVATE_FILES_DIR, LIMITS } = require("../services/hackathonSubmissionFileService");
function createSubmissionUpload() {
    const storage = multer.diskStorage({
        destination(req, file, callback) {
            fs.mkdir(PRIVATE_FILES_DIR, { recursive: true, mode: 0o700 }, (error) =>
                callback(error, PRIVATE_FILES_DIR)
            );
        },
        filename(req, file, callback) {
            callback(null, randomUUID());
        },
    });
    const receive = multer({
        storage,
        limits: { fileSize: LIMITS.demo, files: 1, fields: 4, fieldSize: 128, parts: 5 },
    }).single("file");
    return (req, res, next) =>
        receive(req, res, (error) => {
            if (!error) return next();
            res.status(400).json({
                code: "HACKATHON_FILE_INVALID",
                error:
                    error.code === "LIMIT_FILE_SIZE"
                        ? "Demo 视频须小于 200 MB，BP 文件须小于 30 MB"
                        : "文件上传失败，请检查格式与大小",
            });
        });
}
module.exports = { createSubmissionUpload };
