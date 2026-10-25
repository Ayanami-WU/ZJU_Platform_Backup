const { createHash } = require("node:crypto");
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function importHackathonResults(db, manifest) {
    if (
        manifest.competitionSlug !== "zhekesong-ai-x-2026" ||
        !Array.isArray(manifest.rows) ||
        !manifest.rows.length
    )
        throw new Error("Invalid results manifest");
    const competition = await db.get(
        "SELECT id FROM competitions WHERE slug=? AND deleted_at IS NULL",
        [manifest.competitionSlug]
    );
    if (!competition) throw new Error("Competition not found");
    const result = { inserted: 0, skipped: 0, entries: [] };
    const seen = new Set();
    for (const row of manifest.rows) {
        if (
            !["campus", "industry"].includes(row.track) ||
            !row.team ||
            !row.title ||
            !row.award ||
            !/^[a-f0-9]{64}$/.test(row.sourceHash || "") ||
            !Number.isSafeInteger(row.sourceRow) ||
            (row.rank !== null && (!Number.isSafeInteger(row.rank) || row.rank < 1)) ||
            (row.score !== null &&
                (!Number.isFinite(row.score) || row.score < 0 || row.score > 100))
        )
            throw new Error("Invalid result row");
        const key = hash([row.sourceHash, row.sourceRow]);
        if (seen.has(key)) throw new Error("Duplicate result source row");
        seen.add(key);
        const contentHash = hash(row);
        const previous = await db.get(
            "SELECT id,result_provenance_json FROM competition_works WHERE competition_id=? AND result_source_key=?",
            [competition.id, key]
        );
        if (previous) {
            if (JSON.parse(previous.result_provenance_json).contentHash !== contentHash)
                throw new Error("Existing result source changed");
            result.skipped++;
            result.entries.push({ id: previous.id, action: "skip", contentHash });
            continue;
        }
        // Team results do not establish personal ownership or consent to publish.
        const saved = await db.run(
            `INSERT INTO competition_works
            (competition_id,title,author,summary,track,rank,final_score,entry_code,award,sort_order,status,public_consent,featured,result_source_key,result_provenance_json)
            VALUES(?,?,?,'',?,?,?,?,?,?,'approved',0,0,?,?)`,
            [
                competition.id,
                row.title,
                row.team,
                row.track,
                row.rank === null ? null : String(row.rank),
                row.score,
                row.entryCode || null,
                row.award,
                (row.track === "campus" ? 0 : 100) +
                    (row.rank || 50) +
                    (row.rank === null ? row.sourceRow : 0),
                key,
                JSON.stringify({ contentHash, raw: row, importedAt: new Date().toISOString() }),
            ]
        );
        result.inserted++;
        result.entries.push({ id: saved.lastID, action: "create", contentHash });
    }
    return { ...result, fingerprint: hash(result.entries) };
}
module.exports = { importHackathonResults };
