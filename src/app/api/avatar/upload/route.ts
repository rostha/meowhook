import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { AvatarUploadError, authorizeAvatarUpload, avatarTokenOptions, limitAvatarUploads, validateAvatarUpload } from '@/lib/avatarUploadServer';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new AvatarUploadError('Avatar uploads are temporarily unavailable. Use an image URL instead.', 503);
    if (Number(request.headers.get('content-length') ?? 0) > 8192) throw new AvatarUploadError('Upload request is too large.', 413);
    const text = await request.text();
    if (text.length > 8192) throw new AvatarUploadError('Upload request is too large.', 413);
    let body: HandleUploadBody;
    try { body = JSON.parse(text); } catch { throw new AvatarUploadError('Invalid upload request.'); }
    if (!body || body.type !== 'blob.generate-client-token' || !body.payload) throw new AvatarUploadError('Invalid upload request.');
    const result = await handleUpload({
      body, request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (request.headers.get('origin') !== new URL(request.url).origin) throw new AvatarUploadError('Open Meowhook to upload an avatar.', 403);
        if (multipart) throw new AvatarUploadError('Use a single image of up to 8 MB.');
        const { webhook, contentType } = validateAvatarUpload(pathname, clientPayload);
        const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        await limitAvatarUploads(ip);
        await authorizeAvatarUpload(webhook);
        return avatarTokenOptions(contentType);
      },
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const known = error instanceof AvatarUploadError;
    return NextResponse.json({ error: known ? error.message : 'The avatar could not be uploaded. Please try again.' }, { status: known ? error.status : 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
