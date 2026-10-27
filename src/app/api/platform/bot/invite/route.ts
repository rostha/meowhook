import { applicationId, platformStatus } from '@/lib/platform/config';
import { requireGuild } from '@/lib/platform/discord';
import { requireSession, apiResponse, handleError, PlatformError } from '@/lib/platform/http';
import { PERMISSIONS } from '@/lib/bot/permissions';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    await requireSession(request);
    if (!platformStatus().botConfigured) throw new PlatformError('The Meowhook application is not connected yet.', 503);
    const guildId = new URL(request.url).searchParams.get('guildId') || '';
    await requireGuild(request.headers, guildId);
    const permissions = PERMISSIONS.VIEW_CHANNEL | PERMISSIONS.SEND_MESSAGES | PERMISSIONS.EMBED_LINKS | PERMISSIONS.ATTACH_FILES | PERMISSIONS.MANAGE_ROLES | PERMISSIONS.SEND_MESSAGES_IN_THREADS;
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ client_id: applicationId(), scope: 'bot applications.commands', permissions: permissions.toString(), guild_id: guildId, disable_guild_select: 'true' }).toString();
    return apiResponse({ url: url.href });
  } catch (error) { return handleError(error); }
}
