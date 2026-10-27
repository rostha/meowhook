import { validateSharedMessageShape } from '@/lib/shareValidation';
import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_TTL_SECONDS = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 30;
let localBucket = { count: 0, resetAt: 0 };

function checkLocalRateLimit(): boolean {
  const now = Date.now();
  if (now >= localBucket.resetAt) {
    localBucket = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    return true;
  }
  if (localBucket.count >= RATE_LIMIT_MAX) return false;
  localBucket.count += 1;
  return true;
}

async function checkRateLimit(
  config?: { accountId: string; namespaceId: string; token: string },
): Promise<boolean> {
  if (!config) {
    return checkLocalRateLimit();
  }

  const { accountId, namespaceId, token } = config;
  const windowKey = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
  const key = `__share_rate_limit__:global:${windowKey}`;
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'text/plain',
  };

  try {
    const readRes = await fetch(url, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    let count = 0;
    if (readRes.ok) {
      const text = await readRes.text();
      const parsed = parseInt(text, 10);
      count = Number.isFinite(parsed) ? parsed : 0;
    } else if (readRes.status !== 404) {
      return checkLocalRateLimit();
    }

    if (count >= RATE_LIMIT_MAX) {
      return false;
    }

    const writeRes = await fetch(`${url}?expiration_ttl=${RATE_LIMIT_TTL_SECONDS}`, {
      method: 'PUT',
      headers,
      body: String(count + 1),
    });

    if (!writeRes.ok) {
      return checkLocalRateLimit();
    }

    return true;
  } catch {
    return checkLocalRateLimit();
  }
}

export async function POST(req: NextRequest) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const rateLimitConfig =
      accountId && namespaceId && token ? { accountId, namespaceId, token } : undefined;

    if (!(await checkRateLimit(rateLimitConfig))) {
      return NextResponse.json({ error: 'Too many requests - try again in a minute' }, { status: 429 });
    }

    const body = await req.json();
    const { messages, expiresIn } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0 || messages.length > 25) {
      return NextResponse.json({ error: 'Invalid messages payload' }, { status: 400 });
    }

    for (const msg of messages) {
      if (!validateSharedMessageShape(msg)) {
        return NextResponse.json({ error: 'Invalid message structure' }, { status: 400 });
      }
    }

    const payloadString = JSON.stringify(messages);
    if (payloadString.length > 50000) {
      return NextResponse.json({ error: 'Payload exceeds 50KB maximum size' }, { status: 413 });
    }

    const parsedTtl = typeof expiresIn !== 'undefined' ? parseInt(String(expiresIn), 10) : 604800;
    const maxTtl = 2592000;
    const ttl = Number.isFinite(parsedTtl) && parsedTtl >= 0 && parsedTtl <= maxTtl ? parsedTtl : 604800;
    const id = nanoid(6);

    if (!accountId || !namespaceId || !token) {
      return NextResponse.json({ fallback: true as const }, { status: 503 });
    }

    const ttlQuery = ttl > 0 ? `?expiration_ttl=${ttl}` : '';
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${id}${ttlQuery}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Cloudflare KV Write Error:', errorText);
      return NextResponse.json({ error: 'Failed to write to KV store' }, { status: 500 });
    }

    return NextResponse.json({ id });
  } catch (error) {
    console.error('Failed to create share link:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
