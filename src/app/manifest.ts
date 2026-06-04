import type { MetadataRoute } from "next";

import { BRAND_ASSETS } from "@/lib/brand-assets";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zapros",
    short_name: "Zapros",
    description: "Система запросов поставщикам по задачам Bitrix",
    icons: [
      {
        src: BRAND_ASSETS.favicon,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: BRAND_ASSETS.favicon,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
