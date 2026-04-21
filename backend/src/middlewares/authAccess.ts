import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { verifyAccess } from '../utils/jwt.js';
import { INVALID_TOKEN_ERROR, UNAUTHORIZED_ERROR } from '../constants/error_messages.js';

export function authAccess(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'] ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: UNAUTHORIZED_ERROR });
    return;
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    res.status(StatusCodes.UNAUTHORIZED).json({ error: UNAUTHORIZED_ERROR });
    return;
  }

  try {
    const decoded = verifyAccess(token);
    const userId = Number(decoded.sub);

    if (!Number.isInteger(userId) || userId <= 0) {
      res.status(StatusCodes.UNAUTHORIZED).json({ error: UNAUTHORIZED_ERROR });
      return;
    }

    res.locals.userId = userId;
    next();
  } catch {
    res.status(StatusCodes.FORBIDDEN).json({ error: INVALID_TOKEN_ERROR });
  }
}