import { requireSession, apiResponse, handleError } from '@/lib/platform/http';
import { listGuilds } from '@/lib/platform/discord';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { await requireSession(request); return apiResponse(await listGuilds(request.headers)); }
  catch (error) { return handleError(error); }
}
