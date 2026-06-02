import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A parent directory contains another lockfile, so pin the workspace root
  // to this project to avoid Next.js inferring an incorrect root.
  outputFileTracingRoot: path.join(__dirname),
  // The Supabase public credentials are stored under `PUBLIC_*` names, but the
  // client bundle only inlines `NEXT_PUBLIC_*`. Re-expose them under the
  // expected names. The service role key is intentionally NOT mapped here so it
  // never reaches the browser.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.PUBLIC_SUPABASE_ANON_KEY,
  },
};

export default nextConfig;
