import { getAuth } from '@/lib/auth';
import { getMedia, mediaBytes } from '@/lib/platform/media';
import { PlatformError, handleError } from '@/lib/platform/http';
export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await getAuth();
    const media = await getMedia((await context.params).id);
    if (!media?.ready) throw new PlatformError('This file was not found.', 404);
    // Opaque capability URL, like a Discord attachment. Never serves HTML/SVG as an active document.
    if (media.blobUrl) return Response.redirect(media.blobUrl, 302);
    const inline = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/(mpeg|ogg|wav))$/.test(media.type);
    return new Response(new Uint8Array(await mediaBytes(media)), { headers: {
      'Content-Type': inline ? media.type : 'application/octet-stream', 'Content-Length': String(media.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(media.name)}`,
      'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return handleError(error); }
}
