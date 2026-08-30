import { SignJWT, jwtVerify } from 'jose';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required (set it in the environment before starting the server)');
  }
  return secret;
}

export interface AccessTokenPayload {
  sub: string;
  plan_id: string | null;
}

const encoder = new TextEncoder();

export async function signAccessToken(
  user: { id: string; plan_id: string | null },
  secret = getJwtSecret()
): Promise<string> {
  return new SignJWT({ plan_id: user.plan_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('2h')
    .sign(encoder.encode(secret));
}

export async function verifyAccessToken(token: string, secret = getJwtSecret()): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ['HS256'] });
  if (!payload.sub) {
    throw new Error('access token missing sub');
  }
  return { sub: payload.sub, plan_id: (payload.plan_id as string | null) ?? null };
}
