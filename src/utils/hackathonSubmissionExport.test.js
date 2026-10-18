import test from "node:test";
import assert from "node:assert/strict";
import { submissionExportTable, submissionExportCsv } from "./hackathonSubmissionExport.js";

test("project export preserves submitted and draft snapshots across rounds and excludes registrations without projects", () => {
    const table = submissionExportTable(
        {
            files: [
                { id: 7, name: "handbook.pdf", downloadUrl: "/api/hackathon/submissions/files/7" },
            ],
            rows: [
                {
                    userId: 1,
                    track: "industry",
                    name: '=HYPERLINK("bad")',
                    submissions: {
                        initial: {
                            version: 2,
                            submitted: { projectName: "Formal", bpFileId: 7 },
                            draft: { projectName: "Draft" },
                        },
                        semifinal: { version: 1, draft: { projectName: "Next round" } },
                    },
                },
                { userId: 2, track: "campus", submissions: { initial: null } },
            ],
        },
        (key) => key,
        (value) => value || ""
    );
    assert.equal(table.length, 3);
    assert.equal(table[1][table[0].indexOf("submitted · projectName")], "Formal");
    assert.equal(table[1][table[0].indexOf("draft · projectName")], "Draft");
    assert.equal(table[1][table[0].indexOf("submitted · bpFileId")], "handbook.pdf");
    assert.ok(table[1].includes("https://tuotuzju.com/api/hackathon/submissions/files/7"));
    assert.ok(table[2].includes("export_draft"));
    assert.ok(table.every((row) => row.length === table[0].length));
    const csv = submissionExportCsv(table);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes(`"'=HYPERLINK(""bad"")"`));
});
