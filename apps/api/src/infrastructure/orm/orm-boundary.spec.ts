import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const REPOSITORY_ROOT = join(__dirname, '../../../../..');
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

// ESLint takes over a second to load its config, so one process lints every plant.
const LINT_EVERY_PLANT = `
  import { ESLint } from 'eslint';
  const eslint = new ESLint();
  const results = [];
  for (const { filePath, source } of JSON.parse(process.argv[1])) results.push(...(await eslint.lintText(source, { filePath })));
  console.log(JSON.stringify(results));
`;

const PLANTS = [FEATURE_FILE, REPOSITORY_FILE].flatMap((filePath) => PLANTED_USES.map(([, source]) => ({ filePath, source })));

interface LintResult {
  errorCount: number;
  messages: { message: string }[];
}

describe('the check that keeps TypeORM inside infrastructure/orm', () => {
  let results: LintResult[];

  const getResult = (filePath: string, source: string) => {
    const result = results[PLANTS.findIndex((plant) => plant.filePath === filePath && plant.source === source)];
    if (!result) throw new Error(`ESLint gave no result for ${filePath}`);
    return { errorCount: result.errorCount, text: result.messages.map(({ message }) => message).join('\n') };
  };

  beforeAll(() => {
    const { status, stdout, stderr } = spawnSync(process.execPath, ['--input-type=module', '--eval', LINT_EVERY_PLANT, JSON.stringify(PLANTS)], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
    if (status !== 0) throw new Error(stderr);
    results = JSON.parse(stdout) as LintResult[];
  });

  it.each(PLANTED_USES)('fails on %s in a feature', (_description, source) => {
    const { errorCount, text } = getResult(FEATURE_FILE, source);

    expect(text).toContain(BOUNDARY_MESSAGE);
    expect(errorCount).toBeGreaterThan(0);
  });

  it.each(PLANTED_USES)('allows %s in a repository', (_description, source) => {
    const { errorCount, text } = getResult(REPOSITORY_FILE, source);

    expect(text).not.toContain(BOUNDARY_MESSAGE);
    expect(errorCount).toBe(0);
  });
});
