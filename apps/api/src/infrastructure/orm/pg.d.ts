// pg ships no types, and the URL checks read only this part of it.
declare module 'pg' {
  export class Client {
    constructor(config: { connectionString: string });
    readonly connectionParameters: { host: string; port: number; ssl: unknown };
  }
}
