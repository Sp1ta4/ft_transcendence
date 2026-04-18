import type { Request, Response, NextFunction } from 'express';
import checkEmailUnique from '../../utils/checkEmailUnique.js';
import validateSchema from '../../utils/validateSchema.js';
import { CONFIRM_YOUR_EMAIL, SUCCESSFULLY_REGISTERED } from '../../constants/success_messages.js';
import { StatusCodes } from 'http-status-codes';import Joi from 'joi';
import DataValidationError from '../../utils/error/DataValidationError.js';
import { signAccess, verifyAccess } from '../../utils/jwt.js';
import type AuthService from './auth.service.js';
import type { IRegisterBody, IConfirmBody, ILoginBody, IRefreshBody, ILogoutBody } from '../../types/User/IAuthorization.js';
import { EMAIL_ALREADY_IN_USE, INTERNAL_SERVER_ERROR_MESSAGE, INVALID_TOKEN_ERROR, UNAUTHORIZED_ERROR } from '../../constants/error_messages.js';
import crypto from 'crypto';
import HttpError from '../../utils/error/HttpError.js';
import { GITHUB_OAUTH_PROVIDER, GOOGLE_OAUTH_PROVIDER } from '../../constants/users.js';

class AuthController {
  private service: AuthService;

  constructor(service: AuthService) {
    this.service = service;
  }

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { first_name, last_name, email, username, password, birth_date, role } =
        validateSchema<IRegisterBody>(
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
        throw new DataValidationError(EMAIL_ALREADY_IN_USE);
      }
      await this.service.register({ first_name, last_name, email, username, password, birth_date, role });
      res.status(StatusCodes.OK).json({ message: CONFIRM_YOUR_EMAIL });
    } catch (error) {
      next(error);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, confirmation_code } = validateSchema<IConfirmBody>(
        req.body,
        Joi.object({
          email: Joi.string().email().required(),
          confirmation_code: Joi.string().length(6).required(),
        })
      );
      await this.service.confirm(email, confirmation_code);
      res.status(StatusCodes.CREATED).json({ message: SUCCESSFULLY_REGISTERED});
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, fingerprint } = validateSchema<ILoginBody>(
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
      const { userId, fingerprint } = validateSchema<IRefreshBody>(
        req.body,
        Joi.object({
          userId: Joi.number().positive().required(),
          fingerprint: Joi.string().uuid().required(),
        })
      );

      const refreshToken = req.cookies?.refreshToken as string ;
      const sessionId = req.cookies?.sessionId as string;

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
      const { userId, sessionId } = validateSchema<ILogoutBody>(
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
      res.status(StatusCodes.FORBIDDEN).json({ error: INVALID_TOKEN_ERROR });
    }
  };

  getCurrentUser = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(res.locals.userId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.UNAUTHORIZED).json({ error: UNAUTHORIZED_ERROR });
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

  initiateOAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { fingerprint, provider } = validateSchema(req.body, Joi.object({
          fingerprint: Joi.string().uuid().required(),
          provider: Joi.string().valid(GOOGLE_OAUTH_PROVIDER, GITHUB_OAUTH_PROVIDER).required(),
        }));

        const state = this.service.generateOAuthState(fingerprint);
        const redirectUrl = this.service.generateAuthUrl(provider, state);
        res.status(StatusCodes.TEMPORARY_REDIRECT).redirect(redirectUrl);
    } catch (err) {
        next(err);
    }
  }

  handleGoogleOAuthCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jwtSecret = process.env.ACCESS_SECRET;
      if (!jwtSecret) {
        throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, INTERNAL_SERVER_ERROR_MESSAGE);
      }
      const { code, state } = req.query;
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Missing or invalid code/state');
      }

      let parsedState: { nonce: string; hmac: string; iat: number, fingerprint: string };
      try {
        parsedState = JSON.parse(Buffer.from(state, 'base64url').toString());
      } catch {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Invalid state format');
      }

      const { nonce, hmac, iat, fingerprint } = parsedState;

      if (!iat || Date.now() - iat > 10 * 60 * 1000) {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'State expired');
      }

      const expectedHmac = crypto
        .createHmac('sha256', jwtSecret)
        .update(nonce)
        .digest('hex');

      if (
        hmac.length !== expectedHmac.length ||
        !crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))
      ) {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Invalid state signature');
      }

      const tokens = await this.service.exchangeCodeForGoogleTokens(code);
      const userInfo = this.service.getUserInfoFromGoogleToken(tokens.id_token);
      const user = await this.service.upsertUserFromOAuth(userInfo);
      const { sessionId, refreshToken } = await this.service.addNewSession(user.id, fingerprint);
      const accessToken = signAccess(user.id, sessionId);

      this.setRefreshCookie(res, refreshToken);
      this.setSessionIdCookie(res, sessionId);
      res.status(StatusCodes.OK).json({ accessToken });
    } catch (err) {
      next(err);
    }
  }

  handleGithubOAuthCallback = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jwtSecret = process.env.ACCESS_SECRET;
      if (!jwtSecret) {
        throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, INTERNAL_SERVER_ERROR_MESSAGE);
      }
      const { code, state } = req.query;
      if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Missing or invalid code/state');
      }

      let parsedState: { nonce: string; hmac: string; iat: number, fingerprint: string };
      try {
        parsedState = JSON.parse(Buffer.from(state, 'base64url').toString());
      } catch {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Invalid state format');
      }

      const { nonce, hmac, iat, fingerprint } = parsedState;

      if (!iat || Date.now() - iat > 10 * 60 * 1000) {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'State expired');
      }

      const expectedHmac = crypto
        .createHmac('sha256', jwtSecret)
        .update(nonce)
        .digest('hex');

      if (
        hmac.length !== expectedHmac.length ||
        !crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))
      ) {
        throw new HttpError(StatusCodes.BAD_REQUEST, 'Invalid state signature');
      }

      const tokens = await this.service.exchangeCodeForGithubTokens(code);
      const userInfo = await this.service.getUserInfoFromGithub(tokens.access_token);
      const user = await this.service.upsertUserFromOAuth(userInfo);
      const { sessionId, refreshToken } = await this.service.addNewSession(user.id, fingerprint);
      const accessToken = signAccess(user.id, sessionId);

      this.setRefreshCookie(res, refreshToken);
      this.setSessionIdCookie(res, sessionId);
      res.status(StatusCodes.OK).json({ accessToken });
    } catch (err) {
      next(err);
    }
  }
}

export default AuthController;
