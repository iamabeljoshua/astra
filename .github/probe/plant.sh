#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  tests)
    printf "import { expect, it } from 'vitest';\nit('TEMP planted web failure', () => expect(1).toBe(2));\n" > apps/web/src/planted.test.ts
    printf "import { expect, it } from 'vitest';\nit('TEMP planted agent failure', () => expect(1).toBe(2));\n" > apps/agent/test/planted.test.ts
    ;;
  timeout|postgres) ;;
  seed)
    sed -i "s/^async function seed(databaseUrl: string): Promise<void> {/&\n  throw new Error('TEMP planted seed failure');/" apps/api/src/infrastructure/orm/cli.ts
    grep -n "TEMP planted" apps/api/src/infrastructure/orm/cli.ts
    ;;
  stall)
    sudo iptables -A OUTPUT -p tcp --dport 443 -m string --string "blob.core.windows.net" --algo bm -j DROP
    ;;
  *) exit 2 ;;
esac
