import { spawn } from 'node:child_process';
import { AGENT_ROOT, LIVEKIT_URL, startLabStack, WEB_URL } from './proof/lab-stack.ts';

const stack = await startLabStack();
const agent = spawn(process.execPath, ['src/lab/start-lab.ts', '--url', LIVEKIT_URL, '--webUrl', WEB_URL, ...process.argv.slice(2)], { cwd: AGENT_ROOT, stdio: 'inherit' });
const stopAll = () => {
  agent.kill();
  stack.stop();
  process.exit(0);
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
agent.on('exit', stopAll);
