/** Single source of truth for theme ids (CSS `[data-theme="…"]` + localStorage). */
export const APP_THEMES = [
  'discord-dark',
  'discord-light',
  'midnight-oled',
  'catppuccin',
  'dracula',
  'nord',
] as const;

export type AppTheme = (typeof APP_THEMES)[number];

/** Default for new users, SSR, and invalid stored values */
export const DEFAULT_APP_THEME: AppTheme = 'midnight-oled';

export function normalizeTheme(theme: unknown): AppTheme {
  if (typeof theme === 'string' && (APP_THEMES as readonly string[]).includes(theme)) {
    return theme as AppTheme;
  }
  return DEFAULT_APP_THEME;
}

/** Minified boot snippet for `layout.tsx` — must stay in sync with APP_THEMES + localStorage JSON shape */
export const THEME_BOOT_SCRIPT = `(function(){var T=${JSON.stringify([...APP_THEMES])};var d=document.documentElement;try{var r=localStorage.getItem("meowhook_theme");if(r){var t=JSON.parse(r);if(typeof t==="string"&&T.indexOf(t)!==-1){d.setAttribute("data-theme",t);return}}}catch(e){}d.setAttribute("data-theme","${DEFAULT_APP_THEME}")})();`;
