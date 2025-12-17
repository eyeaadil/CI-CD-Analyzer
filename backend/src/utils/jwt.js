import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

export function signJwt(payload, expiresIn = '7d') {
  const options = { expiresIn };
  return jwt.sign(payload, JWT_SECRET, options);
}

export function verifyJwt(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  
  // Type guard to ensure the decoded token matches our JwtPayload
  if (typeof decoded === 'string' || !decoded || typeof decoded !== 'object' || !('sub' in decoded) || !('username' in decoded)) {
    throw new Error('Invalid token payload');
  }
  
  return decoded;
}
