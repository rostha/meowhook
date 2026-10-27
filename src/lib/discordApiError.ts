/**
 * Discord REST error bodies (e.g. 400 + code 50035) use a nested `errors` object with
 * `_errors` leaves. We flatten them into paths like `embeds.0.description`.
 */

export interface DiscordErrorDetail {
  path: string;
  message: string;
}

export interface DiscordApiErrorPresentation {
  /** Often "Invalid Form Body" or a short API reason */
  headline: string;
  details: DiscordErrorDetail[];
  /** Shown under the title — defaults in the modal */
  intro?: string;
}

const MAX_ERROR_DEPTH = 20;

function flattenDiscordErrors(node: unknown, path: string, depth = 0): DiscordErrorDetail[] {
  if (depth > MAX_ERROR_DEPTH) return [];
  if (node === null || node === undefined) return [];
  if (typeof node !== 'object') return [];
  const o = node as Record<string, unknown>;

  if (Array.isArray(o._errors)) {
    const errs = o._errors as Array<{ message?: string; code?: string | number }>;
    const p = path || 'request';
    return errs.map((e) => ({
      path: p,
      message: e.message ?? String(e.code ?? 'Validation error'),
    }));
  }

  const out: DiscordErrorDetail[] = [];
  for (const [key, value] of Object.entries(o)) {
    if (key === '_errors') continue;
    const next = path ? `${path}.${key}` : key;
    out.push(...flattenDiscordErrors(value, next, depth + 1));
  }
  return out;
}

/**
 * Parse JSON body from a failed Discord webhook / API response.
 */
export function parseDiscordApiErrorBody(body: unknown): DiscordApiErrorPresentation | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const headline =
    typeof b.message === 'string' && b.message.trim()
      ? b.message.trim()
      : 'Discord Error';

  const errorsRoot = b.errors;
  let details: DiscordErrorDetail[] = [];
  if (errorsRoot && typeof errorsRoot === 'object') {
    details = flattenDiscordErrors(errorsRoot, '');
  }

  if (details.length > 0) {
    return { headline, details };
  }

  if (typeof b.message === 'string' && b.message.trim()) {
    return {
      headline: 'Discord Error',
      details: [{ path: '', message: b.message.trim() }],
    };
  }

  return null;
}

export function presentationFromHttpError(status: number, body: unknown): DiscordApiErrorPresentation {
  const parsed = parseDiscordApiErrorBody(body);
  if (parsed) return parsed;
  return {
    headline: 'Discord Error',
    details: [{ path: '', message: `HTTP ${status}` }],
  };
}
