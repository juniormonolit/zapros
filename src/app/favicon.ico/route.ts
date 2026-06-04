import { BRAND_ASSETS } from "@/lib/brand-assets";

export const runtime = "nodejs";

/** Serves the CDN favicon at `/favicon.ico` (browsers request this path by default). */
export async function GET() {
  const upstream = await fetch(BRAND_ASSETS.favicon, {
    next: { revalidate: 86_400 },
  });

  if (!upstream.ok) {
    return new Response("Favicon unavailable", { status: 502 });
  }

  const body = await upstream.arrayBuffer();

  return new Response(body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
