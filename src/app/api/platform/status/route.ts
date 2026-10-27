import { platformStatus } from '@/lib/platform/config';
export const dynamic = 'force-dynamic';
export function GET() { return Response.json({ ...platformStatus(), mediaDirectUpload: Boolean(process.env.BLOB_READ_WRITE_TOKEN) }, { headers: { 'Cache-Control': 'no-store' } }); }
