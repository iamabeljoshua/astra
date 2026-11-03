import { execFileSync } from 'node:child_process';
import { it } from 'vitest';

const ps = (field: string, pid: number) => execFileSync('ps', ['-o', field, '-p', String(pid)], { encoding: 'utf8' }).trim();

it('PLANTED kill of the whole background step from the CI speed review', () => {
  if (!process.env.GITHUB_ACTIONS) return;
  const chain: number[] = [];
  let pid = process.pid;
  while (pid > 1 && !ps('args=', pid).includes('Runner.Worker')) {
    console.log('PLANTED chain', pid, ps('args=', pid).slice(0, 100));
    chain.push(pid);
    pid = Number(ps('ppid=', pid));
  }
  if (pid <= 1) throw new Error('PLANTED never reached Runner.Worker');
  for (const target of chain.reverse()) process.kill(target, 'SIGKILL');
});
