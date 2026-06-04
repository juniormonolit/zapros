import { BRAND_ASSETS } from "@/lib/brand-assets";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon — same asset as the tab favicon. */
export default async function AppleIcon() {
  const upstream = await fetch(BRAND_ASSETS.appleTouchIcon, {
    next: { revalidate: 86_400 },
  });

  if (!upstream.ok) {
    throw new Error(`Failed to load apple icon: ${upstream.status}`);
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
