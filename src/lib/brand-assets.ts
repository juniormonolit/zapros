/**
 * Public brand assets (logos, favicons) served from Yandex Object Storage.
 * Override the bucket base with `NEXT_PUBLIC_BRAND_ASSETS_URL` if needed.
 */

const DEFAULT_BRAND_ASSETS_BASE =
  "https://storage.yandexcloud.net/junior-public-baket";

function brandAssetsBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_BRAND_ASSETS_URL?.trim();
  return (fromEnv && fromEnv.length > 0
    ? fromEnv
    : DEFAULT_BRAND_ASSETS_BASE
  ).replace(/\/$/, "");
}

/** Builds a public URL for a file key in the brand assets bucket. */
export function brandAssetUrl(key: string): string {
  const normalized = key.startsWith("/") ? key.slice(1) : key;
  return `${brandAssetsBase()}/${normalized}`;
}

/** Favicon set under `zapros/imges/favicon/` in the public bucket. */
const FAVICON_PREFIX = "zapros/imges/favicon/";

/** Trimmed brand assets under `favicon/norm/`. */
const NORM_PREFIX = "norm/";
const FAVICON_APP_ICON_FILE = `${NORM_PREFIX}zapros-favicon-norm.png`;
const LOGO_FILE = `${NORM_PREFIX}zapros-logo.png`;

function faviconAsset(fileName: string): string {
  const key = `${FAVICON_PREFIX}${fileName}`;
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${brandAssetsBase()}/${encoded}`;
}

export const BRAND_ASSETS = {
  /** Horizontal wordmark (icon + «Zapros»). */
  logo: faviconAsset(LOGO_FILE),
  logoPng: faviconAsset(LOGO_FILE),
  /** Primary tab / PWA icon (PNG with gradient chat bubble). */
  favicon: faviconAsset(FAVICON_APP_ICON_FILE),
  favicon16: faviconAsset("favicon-16x16.png"),
  favicon32: faviconAsset("favicon-32x32.png"),
  androidChrome192: faviconAsset(FAVICON_APP_ICON_FILE),
  androidChrome512: faviconAsset(FAVICON_APP_ICON_FILE),
  appleTouchIcon: faviconAsset(FAVICON_APP_ICON_FILE),
} as const;
