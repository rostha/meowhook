import type { Message } from './types';

/** Same cap as /api/share POST body. */
export const MAX_SHARE_JSON_BYTES = 50000;

function utf8ToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUtf8(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeMessagesForUrlHash(messages: Message[]): string {
  const json = JSON.stringify(messages);
  // Pre-check string length before encoding (UTF-8 bytes will be >= string length)
  if (new TextEncoder().encode(json).length > MAX_SHARE_JSON_BYTES) {
    throw new Error('SHARE_TOO_LARGE');
  }
  return utf8ToBase64Url(json);
}

export function decodeMessagesFromUrlHash(dataParam: string): Message[] {
  const json = base64UrlToUtf8(dataParam);
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) throw new Error('INVALID_SHARE');
  return parsed as Message[];
}

/** Legacy #data= links (ASCII-only JSON). */
export function tryDecodeLegacyDataHash(dataParam: string): Message[] | null {
  try {
    const parsed = JSON.parse(atob(dataParam)) as unknown;
    if (Array.isArray(parsed)) return parsed as Message[];
    return [parsed as Message];
  } catch {
    return null;
  }
}
