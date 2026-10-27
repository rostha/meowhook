import { validateSharedMessageShape } from '@/lib/shareValidation';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/** Share IDs are short nanoid strings; reject anything else before calling KV */
const SHARE_ID_RE = /^[A-Za-z0-9_-]{4,24}$/;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id || typeof id !== 'string' || !SHARE_ID_RE.test(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !namespaceId || !token) {
      console.error('Missing Cloudflare KV environment variables. Please supply CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_KV_NAMESPACE_ID, and CLOUDFLARE_API_TOKEN in your Vercel Dashboard.');
      return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${id}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (res.status === 404) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404 });
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Cloudflare KV Read Error:', errorText);
      return NextResponse.json({ error: 'Failed to read from KV store' }, { status: 500 });
    }

    const data = await res.text();
    let messages: unknown;
    try {
      messages = JSON.parse(data);
    } catch {
      return NextResponse.json({ error: 'Invalid share data' }, { status: 500 });
    }

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 25) {
      return NextResponse.json({ error: 'Invalid share data' }, { status: 500 });
    }

    if (!messages.every(validateSharedMessageShape)) {
      return NextResponse.json({ error: 'Invalid share data' }, { status: 500 });
    }

    return NextResponse.json(messages, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=3600',
      },
    });
  } catch (error) {
    console.error('Failed to retrieve share link:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
