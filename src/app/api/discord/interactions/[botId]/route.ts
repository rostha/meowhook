import { after } from 'next/server';
import { createInteractionEndpoint } from '@/lib/bot/endpoint';
import { getConfiguredBot, platformBotRepository } from '@/lib/platform/botRepository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handle = createInteractionEndpoint({
  getBot: getConfiguredBot,
  repository: platformBotRepository,
  after,
  onError: error => {
    // Never log the interaction body, which contains a short-lived response token.
    console.error('Discord interaction failed', error instanceof Error ? error.name : 'UnknownError');
  },
});

export async function POST(request: Request, context: { params: Promise<{ botId: string }> }) {
  const { botId } = await context.params;
  return handle(request, botId);
}
