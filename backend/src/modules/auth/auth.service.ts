import {
  USER_EMAIL_CONFIRMATION_CODE_TTL,
  CONFIRM_CODE_REDIS_TAG,
  MAX_DEVICES,
  GOOGLE_OAUTH_PROVIDER,
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

interface RegisterData {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  birth_date: Date;
  role: string;
}

interface LoginData {
  email: string;
  password: string;
  fingerprint: string;
}

interface RefreshData {
  userId: number;
  refreshToken: string;
  sessionId: string;
  fingerprint: string;
}

interface StoredSession {
  tokenHash: string;
  fingerprint: string;
  createdAt: number;
  absoluteExpireAt: number;
}

class AuthService {
  private repository: AuthRepository;
  private usersRepository: UsersRepository;

  constructor(repository: AuthRepository, usersRepository: UsersRepository) {
    this.repository = repository;
    this.usersRepository = usersRepository;
  }

  async register(userData: RegisterData): Promise<void> {
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
    const userData = JSON.parse(raw) as RegisterData & { code: string };

    if (userData.code !== confirmationCode) {
      throw new HttpError(StatusCodes.BAD_REQUEST, CONFIRMATION_CODE_INVALID_OR_EXPIRED);
    }

    const result = await this.usersRepository.createUser(userData);
    if (!result) {
      throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, USER_CREATION_FAILED);
    }
    await this.repository.cache.del(`${CONFIRM_CODE_REDIS_TAG}:${email}`);
  }

  async login({ email, password, fingerprint }: LoginData) {
    const user = await this.usersRepository.getUserByEmail(email);

    if (!user || !user.password_hash || !(await comparePassword(password, user.password_hash))) {
      throw new HttpError(StatusCodes.BAD_REQUEST, USER_NOT_FOUND_OR_INVALID_CRED);
    }

    const { sessionId, refreshToken } = await this.addNewSession(user.id, fingerprint);
    const accessToken = signAccess(user.id, sessionId);

    return { accessToken, refreshToken, sessionId, user };
  }

  async refresh({ userId, refreshToken, sessionId, fingerprint }: RefreshData) {
    const stored = await this.usersRepository.getCachedUser(userId, sessionId);
    if (!stored) {
      throw new HttpError(StatusCodes.BAD_REQUEST, INVALID_REFRESH_TOKEN);
    }
    const session = JSON.parse(stored) as StoredSession;
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

  private async addNewSession(userId: number, fingerprint: string) {
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

  generateAuthUrl(state: string): string {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, INTERNAL_SERVER_ERROR_MESSAGE);
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeCodeForTokens(code: string): Promise<{ id_token: string; access_token: string }> {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    if (!response.ok) {
      throw new HttpError(StatusCodes.BAD_GATEWAY, 'Failed to exchange code for tokens');
    }

    return response.json();
  }

  async getUserInfoFromToken(idToken: string): Promise<{ sub: string; email: string; name: string; picture: string }> {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1], 'base64url').toString()
    );
    return payload;
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

}

export default AuthService;
