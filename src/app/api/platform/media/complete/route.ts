import { head } from '@vercel/blob';
import { requireSession, sameOrigin, readJson, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { getMedia, completeMedia, mediaPublicUrl } from '@/lib/platform/media';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request); const session = await requireSession(request); const body = await readJson(request, 8192);
    const media = await getMedia(String(body.id), session.user.id);
    if (!media?.pathname || typeof body.url !== 'string') throw new PlatformError('This upload was not found.', 404);
    let url: URL; try { url = new URL(body.url); } catch { throw new PlatformError('Invalid upload URL.'); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.public.blob.vercel-storage.com') || decodeURIComponent(url.pathname.slice(1)) !== media.pathname) throw new PlatformError('Invalid upload URL.');
    const blob = await head(url.href);
    if (blob.pathname !== media.pathname || blob.size !== media.size || blob.contentType !== media.type) throw new PlatformError('The uploaded file does not match the selected file.');
    await completeMedia({ ...media, blobUrl: blob.url });
    return apiResponse({ url: mediaPublicUrl(request.url, media), name: media.name, size: media.size, type: media.type });
  } catch (error) { return handleError(error); }
}
