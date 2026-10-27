// Discord's default per-file API limit. Meowhook uses this baseline because a
// webhook URL does not expose the destination server's boosted upload limit.
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const UPLOAD_LIMIT_LABEL = '20 MiB';

export function getUploadSizeError(file: { name: string; size: number }): string | null {
  return file.size > MAX_UPLOAD_BYTES
    ? `"${file.name}" exceeds Meowhook's ${UPLOAD_LIMIT_LABEL} per-file limit. Choose a smaller file.`
    : null;
}
