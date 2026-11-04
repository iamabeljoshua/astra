export async function fetchAppFile(path: string): Promise<ArrayBuffer> {
  const reply = await fetch(path);
  if (!reply.ok) throw new Error(`${path} answered ${reply.status}`);
  return reply.arrayBuffer();
}
