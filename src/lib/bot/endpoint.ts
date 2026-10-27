import { prepareInteraction, type InteractionOptions } from './interactions';
import { verifyDiscordSignature } from './signature';
import type { BotConnection, BotRepository, DiscordInteraction } from './types';
import { ENTITY_ID, SNOWFLAKE } from './validation';

const LIMIT = 128 * 1024;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function readBody(request: Request): Promise<string> {
  const announced = request.headers.get('content-length');
  if (announced && Number(announced) > LIMIT) throw new RangeError('The request is too large.');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new RangeError('The request is too large.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

export interface InteractionEndpointDependencies extends InteractionOptions {
  getBot(botId: string): Promise<BotConnection | null>;
  repository: BotRepository;
  /** Use Next after() to keep asynchronous REST effects alive after the acknowledgement. */
  after(task: () => Promise<void>): void;
}

export function createInteractionEndpoint(dependencies: InteractionEndpointDependencies) {
  return async (request: Request, botId: string): Promise<Response> => {
    if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
    if (!ENTITY_ID.test(botId)) return json({ error: 'Bot not found.' }, 404);
    const bot = await dependencies.getBot(botId).catch(() => null);
    if (!bot?.publicKey) return json({ error: 'Bot not found.' }, 404);
    let raw: string;
    try { raw = await readBody(request); }
    catch (error) { return json({ error: error instanceof RangeError ? 'The request is too large.' : 'Invalid request body.' }, error instanceof RangeError ? 413 : 400); }
    if (!verifyDiscordSignature(raw, request.headers.get('x-signature-ed25519'), request.headers.get('x-signature-timestamp'), bot.publicKey, dependencies.now?.().getTime())) return json({ error: 'Invalid request signature.' }, 401);
    let interaction: DiscordInteraction;
    try {
      interaction = JSON.parse(raw) as DiscordInteraction;
      if (!interaction || typeof interaction !== 'object' || interaction.application_id !== bot.applicationId || !Number.isInteger(interaction.type)) throw new Error();
      if (interaction.type !== 1 && (!SNOWFLAKE.test(interaction.id) || typeof interaction.token !== 'string' || !/^[a-zA-Z0-9._-]{1,512}$/.test(interaction.token))) throw new Error();
    } catch { return json({ error: 'Invalid Discord interaction.' }, 400); }
    try {
      const plan = await prepareInteraction(interaction, bot, dependencies.repository, dependencies);
      if (plan.run) dependencies.after(plan.run);
      return json(plan.response);
    } catch (error) {
      dependencies.onError?.(error);
      return json({ type: 4, data: { flags: 64, content: 'This action could not be loaded. Please try again in a moment.', allowed_mentions: { parse: [] } } });
    }
  };
}
