import { requireSession, sameOrigin, readJson, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { PlatformRepository, resourceName } from '@/lib/platform/repository';
import { saveResource } from '@/lib/platform/resources';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const session = await requireSession(request);
    const kind = resourceName((await context.params).resource);
    return apiResponse({ items: await new PlatformRepository().list(kind, session.user.id) });
  } catch (error) { return handleError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    sameOrigin(request); const session = await requireSession(request);
    const kind = resourceName((await context.params).resource);
    if ((await new PlatformRepository().list(kind, session.user.id)).length >= 500) throw new PlatformError('This section has reached its 500-item limit.', 409);
    return apiResponse({ item: await saveResource(kind, session.user.id, await readJson(request), request.headers) }, 201);
  } catch (error) { return handleError(error); }
}
