import jwt, { JwtPayload as BaseJwtPayload, SignOptions } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export interface JwtPayload extends BaseJwtPayload {
  sub: string; // user id as string for JWT standard compliance
  username: string;
}

export function signJwt(
  payload: Omit<JwtPayload, keyof BaseJwtPayload> & Partial<BaseJwtPayload>,
  expiresIn: number | '1d' | '2d' | '3d' | '4d' | '5d' | '6d' | '7d' | '1h' | '2h' | '3h' | '4h' | '5h' | '6h' | '7h' | '8h' | '9h' | '10h' | '11h' | '12h' | '1m' | '2m' | '3m' | '4m' | '5m' | '6m' | '7m' | '8m' | '9m' | '10m' | '30m' | '1s' | '2s' | '3s' | '4s' | '5s' | '6s' | '7s' | '8s' | '9s' | '10s' | '15s' | '30s' = '7d'
): string {
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // Type guard to ensure the decoded token matches our JwtPayload
  if (typeof decoded === 'string' || !decoded || typeof decoded !== 'object' || !('sub' in decoded) || !('username' in decoded)) {
    throw new Error('Invalid token payload');
  }
  
  return decoded as JwtPayload;
}