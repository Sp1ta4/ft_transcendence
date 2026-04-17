import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

export function signAccess(userId: number, sessionId: string): string {
  return jwt.sign({ sub: String(userId), sid: sessionId }, process.env['ACCESS_SECRET'] ?? '', {
    expiresIn: (process.env['ACCESS_EXPIRES'] ?? '15m') as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccess(token: string): JwtPayload {
  const result = jwt.verify(token, process.env['ACCESS_SECRET'] ?? '');
  if (typeof result === 'string') {
    throw new Error('Invalid token payload');
  }
  return result;
}
