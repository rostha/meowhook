import { requireSession, sameOrigin, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { MAX_MEDIA_BYTES, mediaPublicUrl, registerMedia, writeLocalMedia } from '@/lib/platform/media';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request); const session = await requireSession(request);
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') throw new PlatformError('Use direct upload for hosted media.', 409);
    const limit = MAX_MEDIA_BYTES + 64 * 1024;
    if (Number(request.headers.get('content-length') || 0) > limit) throw new PlatformError('Choose a file up to 20 MiB.', 413);
    const reader = request.body?.getReader(); if (!reader) throw new PlatformError('Choose a file.');
    let length = 0; const chunks: Uint8Array[] = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length;
      if (length > limit) { await reader.cancel(); throw new PlatformError('Choose a file up to 20 MiB.', 413); } chunks.push(value); }
    const form = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') || '' }, body: Buffer.concat(chunks) }).formData();
    const file = form.get('file'); if (!(file instanceof File)) throw new PlatformError('Choose a file.');
    const media = await registerMedia(session.user.id, { name: file.name, size: file.size, type: file.type || 'application/octet-stream' });
    await writeLocalMedia(media, new Uint8Array(await file.arrayBuffer()));
    return apiResponse({ url: mediaPublicUrl(request.url, media), name: media.name, size: media.size, type: media.type }, 201);
  } catch (error) { return handleError(error); }
}
