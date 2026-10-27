import { getAuth } from '@/lib/auth';
import { platformStatus } from './config';

export class PlatformError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function requireSession(request: Request) {
  if (!platformStatus().authAvailable) throw new PlatformError('Accounts are not configured on this deployment yet.', 503);
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new PlatformError('Sign in with Discord to continue.', 401);
  const accounts = await (await auth.$context).internalAdapter.findAccounts(session.user.id);
  const discord = accounts.find(account => account.providerId === 'discord' && /^\d{17,20}$/.test(account.accountId));
  if (!discord) throw new PlatformError('Sign in with Discord to continue.', 401);
  return { ...session, discordAccount: { id: discord.id, accountId: discord.accountId } };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin) throw new PlatformError('This request must come from Meowhook.', 403);
}
export async function readJson(request: Request, maxBytes = 1_000_000): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new PlatformError('Send a JSON request.', 415);
  if (Number(request.headers.get('content-length') || 0) > maxBytes) throw new PlatformError('This request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new PlatformError('A request body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > maxBytes) { await reader.cancel(); throw new PlatformError('This request is too large.', 413); }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new PlatformError('Enter valid JSON.'); }
}
export function apiResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function handleError(error: unknown) {
  if (error instanceof PlatformError) return apiResponse({ error: error.message }, error.status);
  console.error('Platform request failed:', error instanceof Error ? error.message : 'Unknown error');
  return apiResponse({ error: 'Something went wrong. Please try again.' }, 500);
}
