import "dotenv/config";
import { createRemoteJWKSet, jwtVerify } from "jose";

const SUPABASE_URL = process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is not defined");
}

// Supabase signs every access token with a per-project key and publishes the
// public half here. jose fetches + caches it and re-fetches automatically if
// the key ever rotates, so there's no secret to store or manage ourselves.
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export interface SupabaseTokenPayload {
  sub: string;
  email?: string;
}

export const verifySupabaseToken = async (token: string): Promise<SupabaseTokenPayload> => {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${SUPABASE_URL}/auth/v1`,
  });

  if (typeof payload.sub !== "string") {
    throw new Error("Token missing subject");
  }

  return { sub: payload.sub, email: payload.email as string | undefined };
};
