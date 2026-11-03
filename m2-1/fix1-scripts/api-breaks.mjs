import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = '/Users/abel/startup/astra-worktrees/m2-1';
const SERVICE = 'apps/api/src/sessions/sessions.service.ts';
const HOME = 'apps/api/src/home/home.service.ts';
const BREAKS = [
  ['finished sessions offered', SERVICE, "where: { studentId, status: 'in_progress' },", 'where: { studentId },', /every session has finished/],
  ['oldest session offered', SERVICE, "where: { studentId, status: 'in_progress' },\n      order: { startedAt: 'DESC', id: 'DESC' },", "where: { studentId, status: 'in_progress' },\n      order: { startedAt: 'ASC', id: 'DESC' },", /newest of two/],
  ['another student offered', SERVICE, "where: { studentId, status: 'in_progress' },", "where: { status: 'in_progress' },", /another student/],
  ['name dropped', HOME, 'studentName: student.name,', "studentName: 'Someone',", /greets the seeded student/],
  ['cards dropped from the shape', HOME, 'picks: SEEDED_PICKS,', 'picks: [],', /documented shape/],
];
for (const [name, file, find, replace, expected] of BREAKS) {
  const path = `${ROOT}/${file}`;
  const original = readFileSync(path, 'utf8');
  if (!original.includes(find)) { console.log('NOT APPLIED', name); continue; }
  writeFileSync(path, original.replace(find, () => replace));
  const run = spawnSync('pnpm', ['--filter', '@astra/api', 'exec', 'jest', 'src/home/home.controller.spec.ts', '--json', `--outputFile=${process.argv[2]}`], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54422/astra_m2_1_fix' }, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(path, original);
  const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const failed = report.testResults.flatMap((result) => result.assertionResults).filter((test) => test.status === 'failed');
  const hit = failed.find((test) => expected.test(test.fullName));
  console.log(`${hit ? 'CAUGHT' : failed.length ? 'CAUGHT BY OTHER' : 'MISSED'} ${name} | ${failed.length} failing | ${(hit ?? failed[0])?.title ?? ''} | ${(hit ?? failed[0])?.failureMessages?.[0]?.split('\n')[0]?.slice(0, 110) ?? ''}`);
}
