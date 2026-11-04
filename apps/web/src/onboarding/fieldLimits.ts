export const MAX_NAME_LENGTH = 60;

export function isStorableName(name: string): boolean {
  return name.trim().length > 0;
}
