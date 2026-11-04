#!/usr/bin/env bash
set -uo pipefail
M="python3 .github/probe/m.py"
SEMI="--max-semi-space-size=64"
export SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io
lscpu | grep -E 'Model name'; node -v
$M api_types pnpm api:types
$M pg_start pnpm exec supabase db start
pnpm --filter @astra/api exec node dist/infrastructure/orm/cli.js migrate
for i in 1 2 3; do
  $M "lint_base_$i" pnpm lint
  NODE_OPTIONS=$SEMI $M "lint_semi_$i" pnpm lint
  NODE_COMPILE_CACHE=/tmp/ncc $M "lint_cc_$i" pnpm lint
  $M "tsc_base_$i" pnpm typecheck
  NODE_OPTIONS=$SEMI $M "tsc_semi_$i" pnpm typecheck
done
for i in 1 2; do
  $M "web_base_$i" pnpm --filter @astra/web test
  NODE_OPTIONS=$SEMI $M "web_semi_$i" pnpm --filter @astra/web test
  $M "agent_base_$i" pnpm --filter @astra/agent exec vitest run --maxWorkers=3
  NODE_COMPILE_CACHE=/tmp/ncc $M "agent_cc_$i" pnpm --filter @astra/agent exec vitest run --maxWorkers=3
  $M "api_base_$i" pnpm --filter @astra/api exec jest --no-cache
  NODE_OPTIONS=$SEMI $M "api_semi_$i" pnpm --filter @astra/api exec jest --no-cache
done
