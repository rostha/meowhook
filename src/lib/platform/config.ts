export function platformStatus() {
  const local = process.env.NODE_ENV !== 'production' && !process.env.VERCEL;
  const authAvailable = local || Boolean(process.env.DATABASE_URL && (process.env.BETTER_AUTH_SECRET?.length || 0) >= 32 && process.env.BETTER_AUTH_URL);
  const discordConfigured = Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
  const botConfigured = Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_APPLICATION_ID && process.env.DISCORD_PUBLIC_KEY);
  return { authAvailable, discordConfigured, discordLogin: authAvailable && discordConfigured, botConfigured,
    schedulerConfigured: authAvailable && botConfigured && Boolean(process.env.CRON_SECRET) };
}

export function applicationId(): string { return process.env.DISCORD_APPLICATION_ID || 'meowhook'; }
