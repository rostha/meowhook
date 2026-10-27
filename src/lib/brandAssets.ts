import type { AppTheme } from './themes';

export type BrandAssetSet = {
  icon: string;
  letter: string;
  full: string;
};

/**
 * Asset filenames intentionally mirror the source files in `public/`.
 * `MEAWHOOK BLAC LETTER.svg` keeps the original filename as provided.
 */
export const BRAND_ASSETS_LIGHT: BrandAssetSet = {
  icon: encodeURI('/MEAWHOOK ICON BLACK.svg'),
  letter: encodeURI('/MEAWHOOK BLAC LETTER.svg'),
  full: encodeURI('/MEAWHOOK BLACK FULL.svg'),
};

export const BRAND_ASSETS_DARK: BrandAssetSet = {
  icon: encodeURI('/MEAWHOOK ICON WHITE.svg'),
  letter: encodeURI('/MEAWHOOK WHITE LETTER.svg'),
  full: encodeURI('/MEAWHOOK WHITE FULL.svg'),
};

export function isLightBrandTheme(theme: AppTheme | string | null | undefined): boolean {
  return theme === 'discord-light';
}

export function getBrandAssets(theme: AppTheme | string | null | undefined): BrandAssetSet {
  return isLightBrandTheme(theme) ? BRAND_ASSETS_LIGHT : BRAND_ASSETS_DARK;
}
