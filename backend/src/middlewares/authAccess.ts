import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { verifyAccess } from '../utils/jwt.js';

export function authAccess(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] ?? '';
  const token = authHeader.split(' ')[1];

  if (!token) {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const decoded = verifyAccess(token);
    const userId = Number(decoded.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
      return;
    }

    res.locals.userId = userId;
    next();
  } catch {
    res.status(StatusCodes.FORBIDDEN).json({ error: 'Invalid token' });
  }
}