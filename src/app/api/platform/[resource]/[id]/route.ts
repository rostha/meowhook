import { requireSession, sameOrigin, readJson, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { PlatformRepository, resourceName } from '@/lib/platform/repository';
import { assertNoReferences, saveResource } from '@/lib/platform/resources';
export const runtime = 'nodejs';
type Context = { params: Promise<{ resource: string; id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const session = await requireSession(request); const { resource, id } = await context.params;
    const item = await new PlatformRepository().get(resourceName(resource), session.user.id, id);
    if (!item) throw new PlatformError('This item was not found.', 404);
    return apiResponse({ item });
  } catch (error) { return handleError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    sameOrigin(request); const session = await requireSession(request); const { resource, id } = await context.params;
    const kind = resourceName(resource); const repository = new PlatformRepository();
    const item = await repository.get(kind, session.user.id, id);
    if (!item) throw new PlatformError('This item was not found.', 404);
    const changes = await readJson(request);
    const body: Record<string, unknown> = { ...item, ...changes };
    // Raw JSON edits intentionally replace the visual source. Inheriting the previous
    // editorMessage would otherwise silently overwrite the submitted payload.
    if (kind === 'messages' && 'payload' in changes && !('editorMessage' in changes)) delete body.editorMessage;
    return apiResponse({ item: await saveResource(kind, session.user.id, body, request.headers, item) });
  } catch (error) { return handleError(error); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request); const session = await requireSession(request); const { resource, id } = await context.params;
    const kind = resourceName(resource); const repository = new PlatformRepository();
    if (!await repository.get(kind, session.user.id, id)) throw new PlatformError('This item was not found.', 404);
    await assertNoReferences(repository, kind, session.user.id, id);
    await repository.remove(kind, session.user.id, id); return apiResponse({ ok: true });
  } catch (error) { return handleError(error); }
}
