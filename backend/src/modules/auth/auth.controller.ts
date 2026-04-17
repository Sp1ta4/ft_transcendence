import type { Request, Response, NextFunction } from 'express';
import checkEmailUnique from '../../utils/checkEmailUnique.js';
import validateSchema from '../../utils/validateSchema.js';
import { CONFIRM_YOUR_EMAIL } from '../../constants/success_messages.js';
import { StatusCodes } from 'http-status-codes';import Joi from 'joi';
import DataValidationError from '../../utils/error/DataValidationError.js';
import { verifyAccess } from '../../utils/jwt.js';
import type AuthService from './auth.service.js';

interface RegisterBody {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  birth_date: Date;
  role: string;
}

interface ConfirmBody {
  email: string;
  confirmation_code: string;
}

interface LoginBody {
  email: string;
  password: string;
  fingerprint: string;
}

interface RefreshBody {
  userId: number;
  fingerprint: string;
}

interface LogoutBody {
  userId: number;
  sessionId: string;
}

class AuthController {
  private service: AuthService;

  constructor(service: AuthService) {
    this.service = service;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { first_name, last_name, email, username, password, birth_date, role } =
        validateSchema<RegisterBody>(
          req.body,
          Joi.object({
            first_name: Joi.string().min(2).max(42).required(),
            last_name: Joi.string().min(2).max(42).required(),
            email: Joi.string().email().required(),
            username: Joi.string().alphanum().min(3).max(30).required(),
            password: Joi.string()
              .pattern(/[A-Za-z]/, 'letter')
              .pattern(/\d/, 'digit')
              .min(8)
              .max(64)
              .required(),
            birth_date: Joi.date().less('now').required(),
            role: Joi.string().optional().valid('user', 'admin').default('user'),
          })
        );

      const isUnique = await checkEmailUnique(email);
      if (!isUnique) {
        throw new DataValidationError('Email is already in use');
      }
      await this.service.register({ first_name, last_name, email, username, password, birth_date, role });
      res.status(StatusCodes.OK).json({ message: CONFIRM_YOUR_EMAIL });
    } catch (error) {
      next(error);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, confirmation_code } = validateSchema<ConfirmBody>(
        req.body,
        Joi.object({
          email: Joi.string().email().required(),
          confirmation_code: Joi.string().length(6).required(),
        })
      );
      await this.service.confirm(email, confirmation_code);
      res.status(StatusCodes.CREATED).json({ message: 'You successfully registered' });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, fingerprint } = validateSchema<LoginBody>(
        req.body,
        Joi.object({
          email: Joi.string().email().required(),
          password: Joi.string()
            .pattern(/[A-Za-z]/, 'letter')
            .pattern(/\d/, 'digit')
            .min(8)
            .max(64)
            .required(),
          fingerprint: Joi.string().uuid().required(),
        })
      );

      const result = await this.service.login({ email, password, fingerprint });
      this.setRefreshCookie(res, result.refreshToken);
      this.setSessionIdCookie(res, result.sessionId);
      res.status(StatusCodes.OK).json({ accessToken: result.accessToken, user: result.user });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, fingerprint } = validateSchema<RefreshBody>(
        req.body,
        Joi.object({
          userId: Joi.number().positive().required(),
          fingerprint: Joi.string().uuid().required(),
        })
      );

      const refreshToken = req.cookies?.refreshToken as string | undefined;
      const sessionId = req.cookies?.sessionId as string | undefined;

      if (!refreshToken || !sessionId) {
        throw new DataValidationError();
      }

      const tokens = await this.service.refresh({ userId, sessionId, refreshToken, fingerprint });
      this.setRefreshCookie(res, tokens.refreshToken);
      this.setSessionIdCookie(res, tokens.sessionId);
      res.status(StatusCodes.OK).json({ accessToken: tokens.accessToken });
    } catch (err) {
      res.clearCookie('refreshToken');
      res.clearCookie('sessionId');
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId, sessionId } = validateSchema<LogoutBody>(
        req.body,
        Joi.object({
          userId: Joi.number().positive().required(),
          sessionId: Joi.string().uuid().required(),
        })
      );
      await this.service.logout({ userId, sessionId });
      res.clearCookie('refreshToken');
      res.clearCookie('sessionId');
      res.status(StatusCodes.OK).send();
    } catch (err) {
      next(err);
    }
  };

  validateToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'] ?? '';
      const token = authHeader.split(' ')[1];

      if (!token) {
        res.status(StatusCodes.UNAUTHORIZED).json({ error: 'No token provided' });
        return;
      }

      const decoded = verifyAccess(token);
      res.setHeader('X-User-Id', decoded.sub ?? '');
      res.status(StatusCodes.OK).send();
    } catch (err) {
      console.error('Token validation error:', err instanceof Error ? err.message : err);
      res.status(StatusCodes.FORBIDDEN).json({ error: 'Invalid token' });
    }
  };

  getCurrentUser = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(res.locals.userId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.UNAUTHORIZED).json({ error: 'Unauthorized' });
        return;
      }

      const user = await this.service.getUserById(id);
      res.status(StatusCodes.OK).json({ user });
    } catch (err) {
      next(err);
    }
  };

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie('refreshToken', token, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }

  private setSessionIdCookie(res: Response, sid: string): void {
    res.cookie('sessionId', sid, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }
}

export default AuthController;
