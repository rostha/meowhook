'use client';
import { upload } from '@vercel/blob/client';
export async function uploadPlatformMedia(file: File): Promise<{ url: string; name: string; size: number; type: string }> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a file up to 20 MiB.');
  const status = await fetch('/api/platform/status', { cache: 'no-store' }).then(result => result.json());
  let response: Response;
  if (status.mediaDirectUpload) {
    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160) || 'file';
    const blob = await upload(`platform/${id}/${safeName}`, file, { access: 'public', handleUploadUrl: '/api/platform/media/upload',
      contentType: file.type || 'application/octet-stream', clientPayload: JSON.stringify({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' }) });
    response = await fetch('/api/platform/media/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, url: blob.url }) });
  } else {
    const body = new FormData(); body.set('file', file);
    response = await fetch('/api/platform/media', { method: 'POST', body });
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not upload this file.');
  return result;
}
