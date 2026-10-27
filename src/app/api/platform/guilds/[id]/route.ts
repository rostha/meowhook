import { requireSession, apiResponse, handleError } from '@/lib/platform/http';
import { guildDetails } from '@/lib/platform/discord';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { await requireSession(request); return apiResponse(await guildDetails(request.headers, (await context.params).id)); }
  catch (error) { return handleError(error); }
}
