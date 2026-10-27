export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
export const AVATAR_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export function avatarUploadError(file: { size: number; type: string }): string | null {
  if (!AVATAR_IMAGE_TYPES.includes(file.type)) return 'Choose a PNG, JPG, GIF, or WebP image.';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'This image is empty. Choose another file.';
  if (file.size > MAX_AVATAR_BYTES) return 'Avatar images must be 8 MB or smaller.';
  return null;
}

export function avatarUploadPath(type: string, id: string): string {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }[type];
  if (!extension) throw new Error('Unsupported avatar image type.');
  return `avatars/${id}.${extension}`;
}
