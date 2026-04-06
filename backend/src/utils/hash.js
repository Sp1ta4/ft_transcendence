import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export function sha256Hex(input) {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export function randomLong() {
	return uuidv4() + '-' + crypto.randomBytes(32).toString('hex');
}
