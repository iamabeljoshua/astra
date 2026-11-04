#!/usr/bin/env bash
set -uo pipefail
M="python3 .github/probe/m.py"
A="pnpm --filter @astra/agent exec vitest run"
W="pnpm --filter @astra/web exec vitest run"
J="pnpm --filter @astra/api exec jest"
lscpu | grep -E 'Model name|^CPU\(s\)|Thread'; free -m | head -2; node -v
$M api_types pnpm api:types
$M nest_build pnpm --filter @astra/api exec nest build
$M generate pnpm --filter @astra/api exec node scripts/generate-api-types.mjs
$M lint pnpm lint
$M typecheck pnpm typecheck
for p in contracts theme board agent web; do $M "tsc_$p" pnpm --filter "@astra/$p" exec tsc; done
$M tsc_api pnpm --filter @astra/api exec tsc
SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io $M pg_start pnpm exec supabase db start
$M migrate_built pnpm db:migrate
$M seed_built pnpm db:seed
$M migrate_only pnpm --filter @astra/api exec node dist/infrastructure/orm/cli.js migrate
$M seed_only pnpm --filter @astra/api exec node dist/infrastructure/orm/cli.js seed
$M test_contracts pnpm --filter @astra/contracts test
$M test_theme pnpm --filter @astra/theme test
$M test_board pnpm --filter @astra/board test
$M test_web pnpm --filter @astra/web test
$M test_web_w2 $W --maxWorkers=2
$M test_agent pnpm --filter @astra/agent test
for w in 2 3 4 6; do $M "test_agent_w$w" $A --maxWorkers=$w; done
$M test_api $J --cacheDirectory=/tmp/jc1 --json --outputFile=/tmp/probe/api.json
$M test_api_warm $J --cacheDirectory=/tmp/jc1
node -e "
const c=JSON.parse(require('fs').readFileSync('apps/api/package.json')).jest;
c.rootDir=process.cwd()+'/apps/api/src';
for(const v of Object.values(c.transform)) if(v[1].astTransformers) v[1].diagnostics=false;
require('fs').writeFileSync('/tmp/jest.nodiag.json',JSON.stringify(c));
"
$M test_api_nodiag $J --config=/tmp/jest.nodiag.json --cacheDirectory=/tmp/jc2
$M test_api_w2 $J --maxWorkers=2 --cacheDirectory=/tmp/jc3
$M web_build env VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_example pnpm --filter @astra/web build
$M verify bash -c 'pnpm verify start && pnpm verify stop'
node -e "
const r=JSON.parse(require('fs').readFileSync('/tmp/probe/api.json'));
for(const t of r.testResults.sort((a,b)=>(b.endTime-b.startTime)-(a.endTime-a.startTime)))console.log('APIFILE',((t.endTime-t.startTime)/1000).toFixed(1),t.assertionResults.length,t.name.split('/src/')[1]);
"
for n in test_web test_agent test_agent_w2 test_agent_w4 test_api; do echo "::group::$n"; sed -E 's/\x1b\[[0-9;]*m//g' /tmp/probe/$n.log | grep -E '(✓|❯|×|FAIL).*(test\.tsx?)|Duration|Tests  |Test Files|FAIL|PASS.*\(|Time:' | cut -c1-120; echo "::endgroup::"; done
