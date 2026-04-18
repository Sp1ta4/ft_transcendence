import {
  USER_EMAIL_CONFIRMATION_CODE_TTL,
  CONFIRM_CODE_REDIS_TAG,
  MAX_DEVICES,
  GOOGLE_OAUTH_PROVIDER,
  GITHUB_OAUTH_PROVIDER,
} from '../../constants/users.js';
import { CONFIRMATION_CODE_INVALID_OR_EXPIRED, INTERNAL_SERVER_ERROR_MESSAGE, INVALID_REFRESH_TOKEN, SESSION_EXPIRED, USER_CREATION_FAILED, USER_NOT_FOUND_OR_INVALID_CRED } from '../../constants/error_messages.js';
import HttpError from '../../utils/error/HttpError.js';
import { hashPassword, comparePassword } from '../../utils/passwordUtils.js';
import { randomLong, sha256Hex } from '../../utils/hash.js';
import { StatusCodes } from 'http-status-codes';import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { signAccess } from '../../utils/jwt.js';
import type AuthRepository from './auth.repository.js';
import type UsersRepository from '../users/users.repository.js';
import type { User } from '../../generated/prisma/browser.js';
import type { IRegisterData, ILoginData, IRefreshData, IStoredSession } from '../../types/User/IAuthorization.js';
import { strategies } from './utils.js';
import crypto from 'crypto';

class AuthService {
  private repository: AuthRepository;
  private usersRepository: UsersRepository;

  constructor(repository: AuthRepository, usersRepository: UsersRepository) {
    this.repository = repository;
    this.usersRepository = usersRepository;
  }

  async register(userData: IRegisterData): Promise<void> {
    const code = Math.random().toString(36).substring(2, 8);
    userData.password = await hashPassword(userData.password);
    await this.repository.cache.set(
      `${CONFIRM_CODE_REDIS_TAG}:${userData.email}`,
      JSON.stringify({ ...userData, code }),
      { EX: USER_EMAIL_CONFIRMATION_CODE_TTL }
    );
    console.log('##########\n');
    console.log(`Confirmation code for ${userData.email} sended: ${code}`);
    console.log('\n##########');
  }

  async confirm(email: string, confirmationCode: string): Promise<void> {
    const raw = await this.repository.cache.get(`${CONFIRM_CODE_REDIS_TAG}:${email}`);
    if (!raw) {
      throw new HttpError(StatusCodes.BAD_REQUEST, CONFIRMATION_CODE_INVALID_OR_EXPIRED);
    }
    const userData = JSON.parse(raw) as IRegisterData & { code: string };

    if (userData.code !== confirmationCode) {
      throw new HttpError(StatusCodes.BAD_REQUEST, CONFIRMATION_CODE_INVALID_OR_EXPIRED);
    }

    const result = await this.usersRepository.createUser(userData);
    if (!result) {
      throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, USER_CREATION_FAILED);
    }
    await this.repository.cache.del(`${CONFIRM_CODE_REDIS_TAG}:${email}`);
  }

  async login({ email, password, fingerprint }: ILoginData) {
    const user = await this.usersRepository.getUserByEmail(email);

    if (!user || !user.password_hash || !(await comparePassword(password, user.password_hash))) {
      throw new HttpError(StatusCodes.BAD_REQUEST, USER_NOT_FOUND_OR_INVALID_CRED);
    }

    const { sessionId, refreshToken } = await this.addNewSession(user.id, fingerprint);
    const accessToken = signAccess(user.id, sessionId);

    return { accessToken, refreshToken, sessionId, user };
  }

  async refresh({ userId, refreshToken, sessionId, fingerprint }: IRefreshData) {
    const stored = await this.usersRepository.getCachedUser(userId, sessionId);
    if (!stored) {
      throw new HttpError(StatusCodes.BAD_REQUEST, INVALID_REFRESH_TOKEN);
    }
    const session = JSON.parse(stored) as IStoredSession;
    const sentHash = sha256Hex(refreshToken);

    if (moment().unix() >= session.absoluteExpireAt) {
      await this.repository.removeSession(userId, sessionId);
      throw new HttpError(StatusCodes.UNAUTHORIZED, SESSION_EXPIRED);
    }

    if (sentHash !== session.tokenHash) {
      await this.repository.deleteAllSessions(userId);
      throw new HttpError(StatusCodes.BAD_REQUEST, INVALID_REFRESH_TOKEN);
    }

    if (fingerprint !== session.fingerprint) {
      await this.repository.deleteAllSessions(userId);
      throw new HttpError(StatusCodes.BAD_REQUEST, INVALID_REFRESH_TOKEN);
    }

    await this.repository.removeSession(userId, sessionId);
    const newSession = await this.addNewSession(userId, fingerprint);
    const accessToken = signAccess(userId, newSession.sessionId);

    return {
      accessToken,
      refreshToken: newSession.refreshToken,
      sessionId: newSession.sessionId,
    };
  }

  async logout({ userId, sessionId }: { userId: number; sessionId: string }): Promise<void> {
    await this.repository.removeSession(userId, sessionId);
  }

  async getUserById(id: number) {
    return this.usersRepository.getUserById(id);
  }

  async addNewSession(userId: number, fingerprint: string) {
    const sessionsCount = await this.repository.getSessions(userId);

    if (sessionsCount >= MAX_DEVICES) {
      const oldestSessionId = await this.repository.getOldestSession(userId);
      if (oldestSessionId) {
        await this.repository.removeSession(userId, oldestSessionId);
      }
    }

    const sessionId = uuidv4();
    const now = moment.now();

    await this.repository.addSession(userId, { value: sessionId, score: now });

    const refreshToken = randomLong();
    const tokenHash = sha256Hex(refreshToken);
    const sessionData = {
      tokenHash,
      fingerprint,
      createdAt: now,
      absoluteExpireAt: moment().add(60, 'days').unix(),
    };

    await this.repository.createSession(userId, sessionId, sessionData);

    return { sessionId, refreshToken };
  }

  async exchangeCodeForGoogleTokens(code: string): Promise<{ id_token: string; access_token: string }> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: `${process.env.PROVIDER_OAUTH_REDIRECT_URI}/google`,
        grant_type: 'authorization_code',
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error('Token exchange error:', error);
      throw new HttpError(StatusCodes.BAD_GATEWAY, 'Failed to exchange code for tokens');
    }

    return response.json();
  }
  
  async exchangeCodeForGithubTokens(code: string): Promise<{ id_token: string; access_token: string }> {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.GITHUB_OAUTH_CLIENT_ID!,
        client_secret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
        redirect_uri: `${process.env.PROVIDER_OAUTH_REDIRECT_URI}/github`,
      }),
    });
    if (!response.ok) {
      const error = await response.json();
      console.error('Token exchange error:', error);
      throw new HttpError(StatusCodes.BAD_GATEWAY, 'Failed to exchange code for tokens');
    }

    return response.json();
  }

  getUserInfoFromGoogleToken(idToken: string): { 
    email: string; 
    name: string; 
    avatar: string; 
    providerUserId: string; 
    provider: string 
  } {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString()
    );

    return {
      email: payload.email,
      name: payload.name ?? `${payload.given_name ?? ''} ${payload.family_name ?? ''}`.trim(),
      avatar: payload.picture ?? '',
      providerUserId: payload.sub,
      provider: GOOGLE_OAUTH_PROVIDER,
    };
  }

  async getUserInfoFromGithub(accessToken: string) {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      throw new HttpError(StatusCodes.BAD_GATEWAY, 'Failed to get GitHub user info');
    }

    const payload = await response.json();

    let email = payload.email;
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      const emails = await emailsResponse.json();
      email = emails.find((e: any) => e.primary && e.verified)?.email ?? '';
    }

    return {
      email,
      name: payload.name ?? payload.login,
      avatar: payload.avatar_url ?? '',
      providerUserId: String(payload.id),
      provider: GITHUB_OAUTH_PROVIDER,
    };
  }
  
 async upsertUserFromOAuth(data: {
    email: string;
    name: string;
    avatar: string;
    providerUserId: string;
    provider: string;
  }): Promise<User> {
    const user = this.usersRepository.upsertUserFromOAuth(data);
    return user;
  }

  generateAuthUrl(provider: string, state: string): string {
    const strategy = strategies[provider];
    if (!strategy) {
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Unsupported OAuth provider');
    }
    return strategy.buildAuthUrl(state);
  }

  generateOAuthState(fingerprint: string): string {
    const jwtSecret = process.env.ACCESS_SECRET;
    if (!jwtSecret) {        
      throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, INTERNAL_SERVER_ERROR_MESSAGE);
    }
    const nonce = crypto.randomBytes(16).toString("hex");
    const hmac = crypto
                  .createHmac("sha256", jwtSecret)
                  .update(nonce)
                  .digest("hex");
    const payload = {
      nonce,
      hmac,
      fingerprint,
      iat: Date.now(), // issued at
    };
    const state = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return state;
  }
}


export default AuthService;
