import type { Request, Response, NextFunction } from 'express';
import { INTERNAL_SERVER_ERROR_MESSAGE } from '../constants/error_messages.js';
import { StatusCodes } from 'http-status-codes';

export function errorHandler(
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? StatusCodes.INTERNAL_SERVER_ERROR;
  res.status(status).json({
    error: err.message || INTERNAL_SERVER_ERROR_MESSAGE,
  });
}
