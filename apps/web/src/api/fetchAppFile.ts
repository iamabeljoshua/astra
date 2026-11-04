/** A file the app ships, which is not the API. It takes no token and no retry. */
export async function fetchAppFile(path: string): Promise<ArrayBuffer> {
  const reply = await fetch(path);
  if (!reply.ok) throw new Error(`${path} answered ${reply.status}`);
  return reply.arrayBuffer();
}
