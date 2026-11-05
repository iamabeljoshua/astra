const FROZEN_DATE_BASE = 1767225600000;
const HIDDEN_NAMES = ['postMessage', 'fetch', 'XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'WebTransport', 'EventSource', 'Worker', 'SharedWorker', 'BroadcastChannel', 'importScripts', 'FileReaderSync', 'caches', 'indexedDB'];
const TIME_NAMES = ['requestAnimationFrame', 'setTimeout', 'setInterval'];

/** Both runtimes call this after taking their own copies of what they need, so scene code runs with none of it. */
export function lockDown({ document, getSeconds, getRandom, noteIssue }) {
  self.document = document;
  self.window = self;
  Math.random = getRandom;
  performance.now = () => getSeconds() * 1000;
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...parts) { if (parts.length) super(...parts); else super(FROZEN_DATE_BASE + getSeconds() * 1000); }
    static now() { return FROZEN_DATE_BASE + getSeconds() * 1000; }
  }
  self.Date = FrozenDate;
  // These live on the prototypes of a worker's global as well as on the global, and a scene can walk up to them.
  for (let holder = self; holder !== Object.prototype; holder = Object.getPrototypeOf(holder)) {
    for (const name of [...HIDDEN_NAMES, ...TIME_NAMES]) delete holder[name];
  }
  for (const name of HIDDEN_NAMES) Object.defineProperty(self, name, { value: undefined });
  for (const name of TIME_NAMES) Object.defineProperty(self, name, { value: () => { noteIssue(`${name} is not available. render(t) is called for you.`); return 0; } });
}
