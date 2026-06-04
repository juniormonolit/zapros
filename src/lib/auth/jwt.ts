import { SignJWT, jwtVerify } from "jose";

import { SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";

export interface SessionClaims {
  sub: string;
  email: string;
}

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw || raw.trim().length < 32) {
    throw new Error(
      'Missing or weak AUTH_SECRET (min 32 characters). Add to .env.local and restart.',
    );
  }
  return new TextEncoder().encode(raw.trim());
}

export async function signSessionToken(
  claims: SessionClaims,
): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const sub = payload.sub;
    const email = payload.email;
    if (typeof sub !== "string" || typeof email !== "string") {
      return null;
    }
    return { sub, email };
  } catch {
    return null;
  }
}
