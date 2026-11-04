import { installCrashGuards, startTiedChild } from '../../src/scenes/lesson/process-guards.ts';

const child = startTiedChild('sleep', [process.argv[3] as string]);
installCrashGuards((name, error) => console.log(JSON.stringify({ name, error: String(error) })));
console.log(JSON.stringify({ childPid: child.pid }));
if (process.argv[2] === 'throw') setTimeout(() => { throw new Error('one lesson broke'); }, 10);
if (process.argv[2] === 'reject') setTimeout(() => void Promise.reject(new Error('one lesson rejected')), 10);
setInterval(() => console.log(JSON.stringify({ alive: true })), 40);
