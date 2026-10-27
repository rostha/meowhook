import { timingSafeEqual } from 'node:crypto';
import { getAuth } from '@/lib/auth';
import { runScheduledMessages } from '@/lib/scheduling/runner';
import { SqlScheduleRepository } from '@/lib/platform/scheduleRepository';
import { requireBackgroundGuild } from '@/lib/platform/discord';
import { prepareDelivery, deliverPrepared, scheduledError } from '@/lib/platform/delivery';
import { getDatabase } from '@/lib/platform/database';
import { PlatformError, handleError } from '@/lib/platform/http';
import { DiscordRestError } from '@/lib/bot/rest';
import { ScheduledDeliveryError } from '@/lib/scheduling/runner';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get('authorization') || ''); const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  try {
  await getAuth();
  const prepared = new Map<string, Awaited<ReturnType<typeof prepareDelivery>>>();
  const results = await runScheduledMessages({ repository: new SqlScheduleRepository(),
    validate: async claim => {
      try {
        await requireBackgroundGuild(claim.job.ownerId, claim.job.guildId);
        prepared.set(claim.leaseToken, await prepareDelivery(claim.job.ownerId, claim.job.guildId, claim.job.channelId, claim.job.payload, claim.job.actionIds));
        return null;
      } catch (error) {
        if (error instanceof DiscordRestError && error.status === 429) throw scheduledError(error);
        if (error instanceof PlatformError && error.status === 429) throw new ScheduledDeliveryError('rate-limit', error.message);
        if ((error instanceof PlatformError && error.status < 500) || (error instanceof DiscordRestError && error.status < 500)) return error.message;
        // Nothing has been POSTed during preflight; transient database/network outages are safe to retry.
        throw new ScheduledDeliveryError('not-sent', 'This schedule could not be checked yet. Meowhook will retry shortly.');
      }
    },
    send: async (claim, options) => {
      try {
        const delivery = prepared.get(claim.leaseToken); if (!delivery) throw new Error('Schedule was not prepared.');
        const result = await deliverPrepared(delivery, claim.job.channelId, options);
        return { messageId: result.id };
      } catch (error) { throw scheduledError(error); }
    },
  });
  await getDatabase().deleteFrom('platform_interaction').where('created_at', '<', new Date(Date.now() - 7 * 86_400_000).toISOString()).execute();
  return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return handleError(error); }
}
