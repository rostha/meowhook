import { nanoid } from 'nanoid';

export interface ShareStoreConfig {
  accountId: string;
  namespaceId: string;
  token: string;
}

const SHARE_STORE_TIMEOUT_MS = 1200;

export function getShareStoreConfig(): ShareStoreConfig | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !namespaceId || !token) {
    return null;
  }

  return {
    accountId,
    namespaceId,
    token,
  };
}

export async function storeSharedPayload(payload: unknown, ttlSeconds: number, id = nanoid(6)): Promise<string | null> {
  const config = getShareStoreConfig();
  if (!config) {
    return null;
  }

  const ttlQuery = ttlSeconds > 0 ? `?expiration_ttl=${ttlSeconds}` : '';
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}/values/${id}${ttlQuery}`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SHARE_STORE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    return id;
  } catch {
    return null;
  }
}
