import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPOSITORY_ROOT = join(__dirname, '../../../../..');
const ESLINT = join(REPOSITORY_ROOT, 'node_modules/.bin/eslint');
const FEATURE_FILE = 'apps/api/src/sessions/planted.service.ts';
const REPOSITORY_FILE = 'apps/api/src/infrastructure/orm/repositories/planted.repository.ts';
const BOUNDARY_MESSAGE = 'Call a named repository method';

const PLANTED_USES = [
  ["TypeORM's repository type", "import { Repository } from 'typeorm';\nexport const planted = Repository;\n"],
  ['a type-only import', "import type { Repository } from 'typeorm';\nexport type Planted = Repository<object>;\n"],
  ['a deep import', "import { Repository } from 'typeorm/repository/Repository';\nexport const planted = Repository;\n"],
  ['the Nest injection', "import { InjectRepository } from '@nestjs/typeorm';\nexport const planted = InjectRepository;\n"],
  ['a dynamic import', "export const planted = import('typeorm');\n"],
];

function lint(filePath: string, source: string) {
  return spawnSync(ESLINT, ['--stdin', '--stdin-filename', filePath], {
    cwd: REPOSITORY_ROOT,
    input: source,
    encoding: 'utf8',
  });
}

describe('the check that keeps TypeORM inside infrastructure/orm', () => {
  it.each(PLANTED_USES)('fails on %s in a feature', (_description, source) => {
    const { status, stdout } = lint(FEATURE_FILE, source);

    expect(stdout).toContain(BOUNDARY_MESSAGE);
    expect(status).toBe(1);
  });

  it.each(PLANTED_USES)('allows %s in a repository', (_description, source) => {
    const { status, stdout } = lint(REPOSITORY_FILE, source);

    expect(stdout).not.toContain(BOUNDARY_MESSAGE);
    expect(status).toBe(0);
  });
});
