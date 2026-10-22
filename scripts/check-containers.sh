#!/usr/bin/env bash
set -euo pipefail

# Use disposable volumes and local ports; never point this check at production data.
project="zju-config-${GITHUB_RUN_ID:-local}-$$"
export SECRET_KEY="$(openssl rand -hex 32)"
export BACKGROUND_TASKS_DISABLED=1
compose=(docker compose --project-name "$project")
sentinel="server/.env.container-check"
test ! -e "$sentinel"
cleanup() {
    status=$?
    if [ "$status" -ne 0 ]; then
        "${compose[@]}" ps --all
        "${compose[@]}" logs --no-color --tail 100 app dev
    fi
    "${compose[@]}" down --volumes --remove-orphans
    rm -f "$sentinel"
    return "$status"
}
trap cleanup EXIT
printf 'CONTAINER_IGNORE_SENTINEL=synthetic\n' > "$sentinel"

"${compose[@]}" config --quiet
"${compose[@]}" build app dev
"${compose[@]}" up -d app
curl --fail --silent --show-error --retry 40 --retry-all-errors --retry-delay 2 \
    http://127.0.0.1:5181/api/health > /tmp/zju-container-health.json
curl --fail --silent http://127.0.0.1:5181/ > /tmp/zju-container-index.html
grep -q 'id="root"' /tmp/zju-container-index.html
"${compose[@]}" exec -T app sh -c 'test ! -e /app/server/.env.container-check && test -d /app/shared && test -f /app/dist/index.html'
"${compose[@]}" exec -T app node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DATABASE_FILE);
db.exec("CREATE TABLE container_smoke(value TEXT); INSERT INTO container_smoke VALUES (\u0027preserved\u0027)");
db.close();'
"${compose[@]}" up -d --force-recreate app
curl --fail --silent --show-error --retry 40 --retry-all-errors --retry-delay 2 \
    http://127.0.0.1:5181/api/health > /tmp/zju-container-health.json
"${compose[@]}" exec -T app node -e '
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(process.env.DATABASE_FILE);
if (db.prepare("SELECT value FROM container_smoke").get().value !== "preserved") process.exit(1);
db.close();'
"${compose[@]}" run --rm --no-deps backup npm run backup
"${compose[@]}" stop app
"${compose[@]}" up -d dev
curl --fail --silent --show-error --retry 40 --retry-all-errors --retry-delay 2 \
    http://127.0.0.1:5181/api/health > /tmp/zju-container-dev-health.json
curl --fail --silent --show-error --retry 40 --retry-all-errors --retry-delay 2 \
    http://127.0.0.1:5180/api/health > /tmp/zju-container-proxy-health.json
python3 -c 'import json; assert json.load(open("/tmp/zju-container-proxy-health.json"))["status"] == "healthy"'
echo "Container production/development, static assets, shared files, persistence and backup checks passed."
