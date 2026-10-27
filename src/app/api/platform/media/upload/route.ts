import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { requireSession, sameOrigin, readJson, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { getMedia, registerMedia, MAX_MEDIA_BYTES, completeMedia } from '@/lib/platform/media';
import { getAuth } from '@/lib/auth';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new PlatformError('Hosted uploads are not configured yet.', 503);
    const body = await readJson(request, 16_384) as unknown as HandleUploadBody;
    const result = await handleUpload({ body, request,
      onBeforeGenerateToken: async (pathname, payload) => {
        sameOrigin(request); const session = await requireSession(request);
        const match = /^platform\/([a-f0-9-]{36})\/([a-zA-Z0-9._-]{1,160})$/.exec(pathname);
        if (!match) throw new PlatformError('This upload path is invalid.');
        let value: { name: string; size: number; type: string };
        try { value = JSON.parse(payload || '{}'); } catch { throw new PlatformError('This upload is invalid.'); }
        const media = await registerMedia(session.user.id, value, match[1], pathname);
        return { maximumSizeInBytes: MAX_MEDIA_BYTES, allowedContentTypes: [media.type], addRandomSuffix: false,
          allowOverwrite: false, validUntil: Date.now() + 5 * 60_000, tokenPayload: JSON.stringify({ id: media.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        await getAuth();
        const media = await getMedia(JSON.parse(tokenPayload || '{}').id);
        if (media && media.pathname === blob.pathname) await completeMedia({ ...media, blobUrl: blob.url });
      },
    });
    return apiResponse(result);
  } catch (error) { return handleError(error); }
}
