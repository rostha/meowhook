import { describe, it, expect } from 'vitest';
import { parseDiscordApiErrorBody } from './discordApiError';

describe('parseDiscordApiErrorBody', () => {
  it('flattens nested embed validation (Discord 50035 style)', () => {
    const body = {
      message: 'Invalid Form Body',
      code: 50035,
      errors: {
        embeds: {
          '0': {
            description: {
              _errors: [{ code: 'BASE_TYPE_REQUIRED', message: 'This field is required' }],
            },
          },
        },
      },
    };
    const r = parseDiscordApiErrorBody(body);
    expect(r).not.toBeNull();
    expect(r!.headline).toBe('Invalid Form Body');
    expect(r!.details).toEqual([
      { path: 'embeds.0.description', message: 'This field is required' },
    ]);
  });

  it('falls back to top-level message when no errors tree', () => {
    const r = parseDiscordApiErrorBody({ message: '401: Unauthorized' });
    expect(r!.details[0].message).toContain('401');
  });
});
