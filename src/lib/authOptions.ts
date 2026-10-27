import type { BetterAuthOptions } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import type { Database } from '@/lib/platform/database';

export const DISABLED_AUTH_PATHS = [
  '/sign-up/email', '/sign-in/email', '/request-password-reset', '/reset-password', '/verify-password',
  '/change-password', '/set-password', '/change-email', '/update-user', '/send-verification-email', '/verify-email',
  '/link-social', '/unlink-account', '/get-access-token', '/refresh-token',
];

export function createAuthOptions(input: {
  db: Database; type: 'postgres' | 'sqlite'; secret: string; baseURL?: string;
  discord?: { clientId: string; clientSecret: string };
}): BetterAuthOptions {
  return {
    appName: 'Meowhook',
    disabledPaths: DISABLED_AUTH_PATHS,
    baseURL: input.baseURL,
    secret: input.secret,
    database: { db: input.db, type: input.type },
    emailAndPassword: { enabled: false },
    socialProviders: input.discord ? {
      discord: {
        ...input.discord, disableDefaultScope: true, scope: ['identify', 'guilds'], prompt: 'consent',
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: profile => ({
          // Better Auth requires an internal unique email. Identity is always Discord's stable ID;
          // no email permission, email signup, or automatic matching of separate accounts is used.
          email: `${profile.id}@discord.placeholder.invalid`, emailVerified: false,
          discordId: profile.id, discordUsername: profile.username,
        }),
      },
    } : {},
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    user: { additionalFields: {
      // Better Auth also filters trusted provider mappings when input:false. Profile/signup
      // mutation endpoints are disabled, so only the Discord mapper can set these fields.
      discordId: { type: 'string', required: false, input: true },
      discordUsername: { type: 'string', required: false, input: true },
    } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 100,
      customRules: { '/sign-in/social': { window: 60, max: 10 } } },
    advanced: { database: { generateId: 'uuid' }, defaultCookieAttributes: { sameSite: 'lax', httpOnly: true } },
    plugins: [nextCookies()],
  };
}
