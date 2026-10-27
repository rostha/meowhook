import { createPublicKey, verify } from 'node:crypto';

/** Discord signs the untouched bytes of timestamp + request body using Ed25519. */
export function verifyDiscordSignature(rawBody: string, signature: string | null, timestamp: string | null, publicKey: string, now = Date.now()): boolean {
  if (!signature || !timestamp || !/^[a-fA-F0-9]{128}$/.test(signature) || !/^[a-fA-F0-9]{64}$/.test(publicKey) || !/^\d{10}$/.test(timestamp)) return false;
  const signedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > 5 * 60_000) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, 'hex'));
  } catch { return false; }
}
