import type { Embed } from './types';
import { expandDiscordInputEscapes } from './markdown';

export function limitState(count: number, limit: number): 'normal' | 'warn' | 'error' {
  return count > limit ? 'error' : count >= limit * 0.9 ? 'warn' : 'normal';
}

/** Count the text sent to Discord, including its escape expansion and edge trimming. */
export function embedTextLength(embed: Embed): number {
  const length = (value: string) => expandDiscordInputEscapes(value).trim().length;
  return length(embed.title) + length(embed.description) + length(embed.author.name) + length(embed.footer.text)
    + embed.fields.reduce((total, field) => field.name.trim() && field.value.trim()
      ? total + length(field.name) + length(field.value) : total, 0);
}
