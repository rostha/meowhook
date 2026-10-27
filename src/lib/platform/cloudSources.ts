const KEY = 'meowhook_cloud_sources_v1';
export interface CloudSource { id: string; ownerId: string; revision: number }
function entries(): Record<string, CloudSource> {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter((entry): entry is [string, CloudSource] => {
      const value = entry[1] as Partial<CloudSource> | null;
      return !!value && typeof value === 'object' && typeof value.id === 'string' && typeof value.ownerId === 'string' && Number.isInteger(value.revision) && Number(value.revision) > 0;
    }));
  } catch { return {}; }
}
export function cloudSource(localMessageId: string, ownerId: string): CloudSource | undefined {
  const value = entries()[localMessageId];
  return value?.ownerId === ownerId ? value : undefined;
}
export function rememberCloudSource(localMessageId: string, source: CloudSource): boolean {
  try {
    const all = entries(); delete all[localMessageId];
    const recent = Object.entries(all).slice(-499);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries([...recent, [localMessageId, { id: source.id, ownerId: source.ownerId, revision: source.revision }]])));
    return true;
  } catch { return false; }
}
