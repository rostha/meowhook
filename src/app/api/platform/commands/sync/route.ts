import { requireSession, sameOrigin, readJson, apiResponse, handleError } from '@/lib/platform/http';
import { requireGuild, botClient } from '@/lib/platform/discord';
import { getDatabase } from '@/lib/platform/database';
import { applicationId } from '@/lib/platform/config';
import type { SavedCommand } from '@/lib/platform/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    sameOrigin(request); await requireSession(request); const body = await readJson(request);
    const guildId = String(body.guildId); await requireGuild(request.headers, guildId, true);
    // Bulk command registration replaces the guild set: include every administrator's saved commands.
    const rows = await getDatabase().selectFrom('platform_resource').select('data').where('kind', '=', 'commands').where('guild_id', '=', guildId).execute();
    const commands = rows.map(row => JSON.parse(row.data) as SavedCommand)
      .filter(command => command.botId === applicationId() || command.botId === 'meowhook')
      .map(command => ({ ...command, botId: applicationId() }));
    const result = await botClient().syncGuildCommands(applicationId(), guildId, commands);
    return apiResponse({ count: result.length });
  } catch (error) { return handleError(error); }
}
