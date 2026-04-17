import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomLong(): string {
  return uuidv4() + '-' + crypto.randomBytes(32).toString('hex');
}
