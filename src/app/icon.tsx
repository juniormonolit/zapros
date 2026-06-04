import { BRAND_ASSETS } from "@/lib/brand-assets";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Next.js metadata icon — proxied from object storage. */
export default async function Icon() {
  const upstream = await fetch(BRAND_ASSETS.favicon, {
    next: { revalidate: 86_400 },
  });

  if (!upstream.ok) {
    throw new Error(`Failed to load favicon: ${upstream.status}`);
  }

  return new Response(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
