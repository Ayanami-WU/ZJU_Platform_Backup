const fs = require("node:fs/promises");
const path = require("node:path");
const PRIVATE_FILES_DIR = path.resolve(
    process.env.HACKATHON_SUBMISSION_FILES_DIR ||
        path.join(__dirname, "../../data/hackathon-submission-files")
);
const LIMITS = { bp: 30 * 1024 * 1024, demo: 200 * 1024 * 1024 };
const TYPES = {
    ".pdf": "application/pdf",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};
const invalid = (message) =>
    Object.assign(new Error(message), { status: 400, code: "HACKATHON_FILE_INVALID" });
async function inspectSubmissionFile(file, kind) {
    if (!file || !LIMITS[kind]) throw invalid("请选择有效的文件类型");
    const ext = path.extname(file.originalname).toLowerCase();
    if (!(kind === "bp" ? [".pdf", ".ppt", ".pptx"] : [".mp4", ".webm", ".mov"]).includes(ext))
        throw invalid("文件格式不支持");
    if (!file.size || file.size > LIMITS[kind])
        throw invalid(kind === "bp" ? "BP 文件须小于 30 MB" : "Demo 视频须小于 200 MB");
    const handle = await fs.open(file.path, "r");
    let valid = false;
    try {
        const head = Buffer.alloc(Math.min(file.size, 32));
        await handle.read(head, 0, head.length, 0);
        if (ext === ".pdf") valid = head.subarray(0, 5).toString() === "%PDF-";
        if (ext === ".ppt")
            valid = head.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex"));
        if (ext === ".webm") valid = head.subarray(0, 4).equals(Buffer.from("1a45dfa3", "hex"));
        if (ext === ".mp4" || ext === ".mov") {
            valid = head.subarray(4, 8).toString() === "ftyp";
            if (ext === ".mov")
                valid ||= ["moov", "mdat", "wide"].includes(head.subarray(4, 8).toString());
        }
        if (ext === ".pptx" && head.subarray(0, 4).equals(Buffer.from("504b0304", "hex"))) {
            // Inspect the ZIP directory without extracting or executing uploaded content.
            const tail = Buffer.alloc(Math.min(file.size, 1024 * 1024));
            await handle.read(tail, 0, tail.length, file.size - tail.length);
            valid =
                tail.includes(Buffer.from("ppt/presentation.xml")) &&
                tail.includes(Buffer.from("[Content_Types].xml"));
        }
    } finally {
        await handle.close();
    }
    if (!valid) throw invalid("文件内容与格式不符，请重新上传");
    let name = file.originalname;
    // Browsers send UTF-8 filenames while busboy exposes the multipart header as Latin-1.
    if (/[^\x00-\x7f]/.test(name) && !/[^\x00-\xff]/.test(name)) {
        const decoded = Buffer.from(name, "latin1").toString("utf8");
        if (!decoded.includes("\ufffd")) name = decoded;
    }
    name = path
        .basename(name.replace(/\\/g, "/"))
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .slice(0, 240);
    return {
        storageName: file.filename,
        name: name || `material${ext}`,
        size: file.size,
        mimeType: TYPES[ext],
    };
}
module.exports = { PRIVATE_FILES_DIR, LIMITS, inspectSubmissionFile };
