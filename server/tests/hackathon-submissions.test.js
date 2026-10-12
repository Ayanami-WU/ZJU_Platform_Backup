const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const defaults = require("../../shared/hackathonAiX.json");
const { migrateHackathonSubmissions } = require("../src/config/migrations/hackathonSubmissions");
const {
    createHackathonSubmissionService,
    normalizeMaterials,
} = require("../src/services/hackathonSubmissionService");
const eventKey = defaults.event.key;
const materials = {
    projectName: "Project",
    githubUrl: "https://github.com/example/project",
    modelscopeUrl: "https://example-project.ms.show",
    bpFileId: null,
    demoFileId: null,
};

test("AI+X materials require actual GitHub and ModelScope deployment HTTPS links", () => {
    for (const githubUrl of [
        "javascript:alert(1)",
        "https://github.com.evil.test/a/b",
        "https://github.com/a",
        "https://github.com/a/b/issues",
        "https://user:pass@github.com/a/b",
    ]) {
        assert.throws(
            () => normalizeMaterials({ ...materials, githubUrl }),
            (e) => e.field === "githubUrl"
        );
    }
    for (const modelscopeUrl of [
        "https://modelscope.cn/models/a/b",
        "https://modelscope.cn.evil.test/studios/a/b",
        "https://evil.test",
        "http://a.ms.show",
        "https://a.ms.show:123/a",
    ]) {
        assert.throws(
            () => normalizeMaterials({ ...materials, modelscopeUrl }),
            (e) => e.field === "modelscopeUrl"
        );
    }
    for (const modelscopeUrl of [
        "https://modelscope.cn/studios/a/b/summary",
        "https://modelscope.ai/studios/a/b",
        "https://a-b.ms.show/demo",
    ]) {
        assert.ok(normalizeMaterials({ ...materials, modelscopeUrl }).modelscopeUrl);
    }
    assert.throws(
        () => normalizeMaterials({ ...materials, demoFileId: "https://example.com/demo" }),
        (e) => e.field === "demoFileId"
    );
    assert.throws(
        () => normalizeMaterials({ ...materials, bpFileId: -1 }),
        (e) => e.field === "bpFileId"
    );
    assert.equal(normalizeMaterials({ githubUrl: "", modelscopeUrl: "" }).githubUrl, "");
});

test("AI+X isolated migration, stage windows, snapshots, ownership, qualification and concurrent updates", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-submission-"));
    const filename = path.join(dir, "isolated.sqlite");
    const db = await open({ filename, driver: sqlite3.Database });
    let clock = Date.parse("2026-10-12T23:59:59+08:00");
    const service = createHackathonSubmissionService({ filename, now: () => clock });
    const save = (changes = {}, userId = 1) =>
        service.save(userId, {
            eventKey,
            track: "campus",
            stage: "initial",
            action: "submit",
            expectedVersion: 0,
            materials,
            ...changes,
        });
    const rejects = (fn, code, reason) =>
        assert.rejects(fn, (e) => e.code === code && (!reason || e.reason === reason));
    try {
        await db.exec(`PRAGMA foreign_keys=ON;
            CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY);
            INSERT INTO users VALUES(1),(2),(3),(4);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,name TEXT,student_id TEXT,form_data_json TEXT,created_at TEXT,github_repository_url TEXT,modelscope_repository_url TEXT,repositories_updated_at TEXT);`);
        const otherEvent = { event: { key: "other" }, custom: "untouched" };
        await db.run("INSERT INTO settings VALUES(?,?)", [
            "hackathon_schedule_config",
            JSON.stringify({
                revision: 1,
                activeEventKey: eventKey,
                events: [structuredClone(defaults), otherEvent],
            }),
        ]);
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?,1,?,?,?, ?,?,?,?)", [
            eventKey,
            "User One",
            "001",
            JSON.stringify({ track: ["campus", "industry"], team: "Legacy team", teamSize: 3 }),
            "2026-10-12",
            "https://github.com/legacy/old",
            "",
            "2026-10-12",
        ]);
        await db.run(
            "INSERT INTO hackathon_registrations(id,event_key,user_id,name,student_id,form_data_json,created_at) VALUES(2,?,2,?,?,?,?)",
            [eventKey, "User Two", "002", JSON.stringify({ track: ["industry"] }), "2026-10-12"]
        );
        await migrateHackathonSubmissions(db);
        const firstConfig = (
            await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'")
        ).value;
        await migrateHackathonSubmissions(db);
        assert.equal(
            (await db.get("SELECT value FROM settings WHERE key='hackathon_schedule_config'"))
                .value,
            firstConfig
        );
        assert.deepEqual(JSON.parse(firstConfig).events[1], otherEvent);
        assert.equal((await db.get("SELECT count(*) n FROM hackathon_submissions")).n, 0);
        let mine = await service.getMine(1, eventKey);
        assert.equal(mine.legacyRepositories.githubUrl, "https://github.com/legacy/old");
        assert.equal(mine.tracks.campus.stages.initial.state, "upcoming");
        for (const track of ["campus", "industry"]) {
            assert.deepEqual(mine.tracks[track].stages.initial.requiredFields, [
                "projectName",
                "githubUrl",
                "modelscopeUrl",
            ]);
            assert.deepEqual(
                mine.tracks[track].stages.semifinal.requiredFields,
                track === "campus"
                    ? ["projectName", "githubUrl", "modelscopeUrl", "bpFileId", "demoFileId"]
                    : ["projectName", "githubUrl", "modelscopeUrl", "demoFileId"]
            );
        }
        await rejects(() => save(), "HACKATHON_SUBMISSION_BLOCKED", "not_open");
        clock = Date.parse("2026-10-13T00:00:00+08:00");
        await rejects(() => save({}, 2), "HACKATHON_SUBMISSION_BLOCKED", "not_registered");
        await rejects(() => save({}, 3), "HACKATHON_SUBMISSION_BLOCKED", "not_registered");
        await assert.rejects(
            () =>
                save({
                    materials: {
                        projectName: materials.projectName,
                        githubUrl: materials.githubUrl,
                    },
                }),
            (e) => e.field === "modelscopeUrl"
        );
        for (const projectName of [undefined, "", "   \t\n", "x".repeat(161)]) {
            await assert.rejects(
                () => save({ materials: { ...materials, projectName } }),
                (e) => e.code === "HACKATHON_SUBMISSION_INVALID" && e.field === "projectName"
            );
        }
        const draft = await save({ action: "save", materials: { projectName: "  \t\n" } });
        assert.equal(draft.submission.draft.projectName, "");
        assert.equal(draft.submission.version, 1);
        assert.equal(draft.submission.submitted, null);
        const formal = await save({ expectedVersion: 1 });
        assert.equal(formal.submission.version, 2);
        assert.equal(formal.submission.submitted.githubUrl, materials.githubUrl);
        const changed = await save({
            action: "save",
            expectedVersion: 2,
            materials: { ...materials, projectName: "Draft edit" },
        });
        assert.equal(changed.submission.draft.projectName, "Draft edit");
        assert.equal(changed.submission.submitted.projectName, "Project");
        const results = await Promise.allSettled([
            save({ expectedVersion: 3 }),
            save({ expectedVersion: 3 }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
            results.find((r) => r.status === "rejected").reason.code,
            "HACKATHON_SUBMISSION_CONFLICT"
        );
        assert.equal((await service.getMine(2, eventKey)).submissions.length, 0);
        await rejects(
            () => save({ track: "industry" }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "not_open"
        );
        clock = Date.parse("2026-10-18T13:00:00+08:00");
        assert.equal((await save({ track: "industry" })).submission.version, 1);
        await save({ track: "industry" }, 2);
        clock = Date.parse("2026-10-18T17:00:00+08:00");
        await rejects(() => save({ expectedVersion: 4 }), "HACKATHON_SUBMISSION_BLOCKED", "closed");
        await rejects(
            () => save({ track: "industry", expectedVersion: 1 }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "closed"
        );
        clock = Date.parse("2026-10-19T00:00:00+08:00");
        await rejects(
            () => save({ stage: "semifinal" }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "not_qualified"
        );
        await service.setQualification(4, {
            eventKey,
            userId: 1,
            track: "campus",
            qualified: true,
        });
        await assert.rejects(
            () => save({ stage: "semifinal" }),
            (e) => e.field === "bpFileId"
        );
        const uploadedBp = (
            await service.addFile(
                1,
                { eventKey, track: "campus", stage: "semifinal", kind: "bp" },
                { storageName: "bp-one", name: "BP.pdf", size: 42, mimeType: "application/pdf" }
            )
        ).file;
        const uploadedDemo = (
            await service.addFile(
                1,
                { eventKey, track: "campus", stage: "semifinal", kind: "demo" },
                { storageName: "demo-one", name: "Demo.mp4", size: 42, mimeType: "video/mp4" }
            )
        ).file;
        await assert.rejects(
            () => service.getFile(2, uploadedBp.id),
            (e) => e.status === 404
        );
        assert.equal((await service.getFile(4, uploadedBp.id, true)).original_name, "BP.pdf");
        await save({
            stage: "semifinal",
            materials: {
                ...materials,
                bpFileId: uploadedBp.id,
                demoFileId: uploadedDemo.id,
            },
        });
        await rejects(
            () => save({ track: "industry", stage: "semifinal" }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "not_qualified"
        );
        await service.setQualification(4, {
            eventKey,
            userId: 1,
            track: "industry",
            qualified: true,
        });
        await assert.rejects(
            () =>
                save({
                    track: "industry",
                    stage: "semifinal",
                    materials: { ...materials, demoFileId: uploadedDemo.id },
                }),
            (e) => e.field === "demoFileId"
        );
        const industryDemo = (
            await service.addFile(
                1,
                { eventKey, track: "industry", stage: "semifinal", kind: "demo" },
                { storageName: "demo-industry", name: "Demo.mp4", size: 42, mimeType: "video/mp4" }
            )
        ).file;
        await save({
            track: "industry",
            stage: "semifinal",
            materials: { ...materials, demoFileId: industryDemo.id },
        });
        await service.setQualification(4, {
            eventKey,
            userId: 1,
            track: "campus",
            qualified: false,
        });
        await rejects(
            () => save({ stage: "semifinal", expectedVersion: 1 }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "not_qualified"
        );
        await assert.rejects(
            () =>
                service.setQualification(4, {
                    eventKey,
                    userId: 2,
                    track: "campus",
                    qualified: true,
                }),
            (e) => e.status === 404
        );
        const roster = await service.getRoster(eventKey);
        assert.equal(roster.rows.length, 3);
        const firstCampus = roster.rows.find((r) => r.userId === 1 && r.track === "campus");
        assert.equal(firstCampus.teamSize, 3);
        assert.equal(firstCampus.submissions.initial.version, 4);
        assert.equal(firstCampus.submissions.semifinal.version, 1);
        assert.equal(roster.rows.find((r) => r.userId === 2).submissions.semifinal, null);
        clock = Date.parse("2026-10-24T00:00:00+08:00");
        await rejects(
            () => save({ track: "industry", stage: "semifinal", expectedVersion: 1 }),
            "HACKATHON_SUBMISSION_BLOCKED",
            "closed"
        );
        mine = await service.getMine(1, eventKey);
        assert.equal(mine.submissions.length, 4);
        assert.equal(mine.tracks.industry.stages.final.canSave, false);
        assert.equal(mine.tracks.industry.stages.final.state, "presentation");
        assert.throws(
            () => save({ stage: "final" }),
            (e) => e.status === 400
        );
        assert.throws(
            () => save({ eventKey: "other" }),
            (e) => e.status === 400
        );
        await db.run("DELETE FROM hackathon_registrations WHERE id=1");
        assert.equal(
            (await db.get("SELECT count(*) n FROM hackathon_submissions WHERE user_id=1")).n,
            0
        );
        assert.equal(
            (
                await db.get(
                    "SELECT count(*) n FROM hackathon_submission_qualifications WHERE user_id=1"
                )
            ).n,
            0
        );
    } finally {
        await db.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("private attachment validation checks signatures, names and limits without extracting content", async () => {
    const {
        inspectSubmissionFile,
        LIMITS,
    } = require("../src/services/hackathonSubmissionFileService");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-file-"));
    const inspect = async (name, bytes, kind, override = {}) => {
        const filename = "random-private-name";
        const filePath = path.join(dir, filename);
        fs.writeFileSync(filePath, bytes);
        return inspectSubmissionFile(
            { originalname: name, filename, path: filePath, size: bytes.length, ...override },
            kind
        );
    };
    try {
        const pdf = await inspect("../../BP.pdf", Buffer.from("%PDF-1.7\n%%EOF"), "bp");
        assert.equal(pdf.name, "BP.pdf");
        assert.equal(pdf.storageName, "random-private-name");
        assert.equal(pdf.mimeType, "application/pdf");
        await assert.rejects(
            () => inspect("BP.pdf", Buffer.from("<html>not PDF</html>"), "bp"),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
        await assert.rejects(
            () => inspect("BP.pdf", Buffer.from("%PDF-1.7"), "bp", { size: LIMITS.bp + 1 }),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
        await assert.rejects(
            () => inspect("Demo.mp4", Buffer.from("%PDF-1.7"), "demo"),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
        const video = Buffer.concat([
            Buffer.from([0, 0, 0, 24]),
            Buffer.from("ftypisom"),
            Buffer.alloc(12),
        ]);
        assert.equal((await inspect("Demo.mp4", video, "demo")).mimeType, "video/mp4");
        await assert.rejects(
            () => inspect("Demo.mp4", video, "bp"),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
        await assert.rejects(
            () => inspect("Demo.mp4", video, "demo", { size: LIMITS.demo + 1 }),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
        await assert.rejects(
            () => inspect("BP.pptx", Buffer.from("PK\x03\x04 unrelated ZIP"), "bp"),
            (e) => e.code === "HACKATHON_FILE_INVALID"
        );
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("private multipart upload and authenticated download controller use isolated storage", async () => {
    const express = require("express");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aix-http-file-"));
    const filename = path.join(dir, "test.sqlite");
    const oldDatabase = process.env.DATABASE_FILE;
    const oldFiles = process.env.HACKATHON_SUBMISSION_FILES_DIR;
    process.env.DATABASE_FILE = filename;
    process.env.HACKATHON_SUBMISSION_FILES_DIR = path.join(dir, "private");
    for (const moduleName of [
        "../src/services/hackathonSubmissionFileService",
        "../src/middleware/hackathonSubmissionUpload",
        "../src/controllers/hackathonSubmissionController",
    ])
        delete require.cache[require.resolve(moduleName)];
    const originalNow = Date.now;
    Date.now = () => Date.parse("2026-10-19T12:00:00+08:00");
    const controller = require("../src/controllers/hackathonSubmissionController");
    Date.now = originalNow;
    const { createSubmissionUpload } = require("../src/middleware/hackathonSubmissionUpload");
    const db = await open({ filename, driver: sqlite3.Database });
    let server;
    try {
        await db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1),(2),(4);
            CREATE TABLE hackathon_registrations(id INTEGER PRIMARY KEY,event_key TEXT,user_id INTEGER,form_data_json TEXT,created_at TEXT);
        `);
        await db.run("INSERT INTO settings VALUES(?,?)", [
            "hackathon_schedule_config",
            JSON.stringify({ activeEventKey: eventKey, events: [defaults] }),
        ]);
        await db.run("INSERT INTO hackathon_registrations VALUES(1,?,1,?,?)", [
            eventKey,
            JSON.stringify({ track: ["campus"] }),
            "2026-10-13",
        ]);
        await migrateHackathonSubmissions(db);
        const service = createHackathonSubmissionService({
            filename,
            now: () => Date.parse("2026-10-19T12:00:00+08:00"),
        });
        await service.setQualification(4, {
            eventKey,
            userId: 1,
            track: "campus",
            qualified: true,
        });
        const app = express();
        // Identity is injected solely in this isolated controller harness; live routes use authenticateToken.
        app.use((req, res, next) => {
            req.user = {
                id: Number(req.headers["x-test-user"] || 1),
                role: req.headers["x-test-role"] || "user",
            };
            next();
        });
        app.post("/files", createSubmissionUpload(), controller.uploadFile);
        app.get("/files/:id", controller.downloadFile);
        app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
        server = await new Promise((resolve) => {
            const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
        });
        const url = `http://127.0.0.1:${server.address().port}`;
        const upload = async (content, name = "计划书.pdf") => {
            const form = new FormData();
            for (const [key, value] of Object.entries({
                eventKey,
                track: "campus",
                stage: "semifinal",
                kind: "bp",
            }))
                form.append(key, value);
            form.append("file", new Blob([content], { type: "application/pdf" }), name);
            return fetch(`${url}/files`, { method: "POST", body: form });
        };
        const response = await upload("%PDF-1.7\n%%EOF");
        assert.equal(response.status, 200);
        const { file } = await response.json();
        assert.equal(file.name, "计划书.pdf");
        assert.ok(!file.storageName);
        const download = await fetch(`${url}/files/${file.id}`);
        assert.equal(download.status, 200);
        assert.match(download.headers.get("content-disposition"), /^attachment;/);
        assert.equal(download.headers.get("cache-control"), "private, no-store");
        assert.equal(await download.text(), "%PDF-1.7\n%%EOF");
        assert.equal(
            (await fetch(`${url}/files/${file.id}`, { headers: { "x-test-user": "2" } })).status,
            404
        );
        assert.equal(
            (
                await fetch(`${url}/files/${file.id}`, {
                    headers: { "x-test-user": "4", "x-test-role": "admin" },
                })
            ).status,
            200
        );
        assert.equal((await upload("<html>fake PDF</html>")).status, 400);
        assert.equal(fs.readdirSync(path.join(dir, "private")).length, 1);
        assert.equal((await db.get("SELECT count(*) n FROM hackathon_submission_files")).n, 1);
    } finally {
        if (server) await new Promise((resolve) => server.close(resolve));
        await db.close();
        if (oldDatabase === undefined) delete process.env.DATABASE_FILE;
        else process.env.DATABASE_FILE = oldDatabase;
        if (oldFiles === undefined) delete process.env.HACKATHON_SUBMISSION_FILES_DIR;
        else process.env.HACKATHON_SUBMISSION_FILES_DIR = oldFiles;
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
