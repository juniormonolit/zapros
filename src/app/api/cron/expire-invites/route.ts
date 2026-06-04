import { NextResponse } from "next/server";

import { runExpireInvites } from "@/lib/expire-invites";
import { createAdminClient } from "@/lib/admin-client";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim() === "") {
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token === cronSecret;
}

async function handleExpireInvites() {
  const admin = createAdminClient();
  const result = await runExpireInvites(admin, new Date());

  return NextResponse.json({
    ok: result.errors.length === 0,
    expiredInviteCount: result.expiredInviteCount,
    updatedRequestCount: result.updatedRequestCount,
    errors: result.errors,
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleExpireInvites();
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleExpireInvites();
}
