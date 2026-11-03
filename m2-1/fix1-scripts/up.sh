#!/bin/bash
# Usage: up.sh <dist folder>. Starts the API and the static server in their own process groups.
S=/private/tmp/claude-501/-Users-abel-startup-einstain-ai/043bc9b9-6c62-4e41-9461-4fb93f368259/scratchpad/m2-1-fix1
cd /Users/abel/startup/astra-worktrees/m2-1
export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54422/astra_m2_1_fix
if ! lsof -iTCP:3511 -sTCP:LISTEN >/dev/null; then
  API_PORT=3511 nohup node apps/api/dist/main.js > $S/api.log 2>&1 &
  echo $! > $S/api.pid
fi
if lsof -tiTCP:5511 -sTCP:LISTEN >/dev/null; then kill $(lsof -tiTCP:5511 -sTCP:LISTEN); sleep 0.3; fi
nohup node $S/scripts/serve.mjs "$1" 5511 3511 > $S/serve.log 2>&1 &
echo $! > $S/serve.pid
for i in $(seq 1 40); do curl -sf http://127.0.0.1:5511/api/home >/dev/null && break; sleep 0.25; done
curl -s http://127.0.0.1:5511/api/home | head -c 120; echo
