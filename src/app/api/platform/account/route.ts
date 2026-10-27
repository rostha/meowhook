import { requireSession, apiResponse, handleError } from '@/lib/platform/http';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const user = session.user as typeof session.user & { discordUsername?: string };
    return apiResponse({ user: { ...user, email: user.email?.endsWith('@discord.placeholder.invalid') ? undefined : user.email }, discordLinked: true,
      discordUser: { id: session.discordAccount.accountId, username: user.discordUsername || user.name, displayName: user.name, avatarUrl: user.image || undefined } });
  } catch (error) { return handleError(error); }
}
