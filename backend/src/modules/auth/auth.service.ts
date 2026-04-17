import {
  USER_EMAIL_CONFIRMATION_CODE_TTL,
  CONFIRM_CODE_REDIS_TAG,
  MAX_DEVICES,
} from '../../constants/users.js';
import { USER_NOT_FOUND_OR_INVALID_CRED } from '../../constants/error_messages.js';
import HttpError from '../../utils/error/HttpError.js';
import { hashPassword, comparePassword } from '../../utils/passwordUtils.js';
import { randomLong, sha256Hex } from '../../utils/hash.js';
import { StatusCodes } from 'http-status-codes';import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { signAccess } from '../../utils/jwt.js';
import type AuthRepository from './auth.repository.js';
import type UsersRepository from '../users/users.repository.js';

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
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Confirmation code expired or invalid');
    }
    const userData = JSON.parse(raw) as RegisterData & { code: string };

    if (userData.code !== confirmationCode) {
      throw new HttpError(StatusCodes.BAD_REQUEST, 'Confirmation code expired or invalid');
    }

    userData.password = await hashPassword(userData.password);
    const result = await this.usersRepository.createUser(userData);
    if (!result) {
      throw new HttpError(StatusCodes.INTERNAL_SERVER_ERROR, 'User creation failed');
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
      throw new HttpError(StatusCodes.BAD_REQUEST, 'invalid refresh token');
    }
    const session = JSON.parse(stored) as StoredSession;
    const sentHash = sha256Hex(refreshToken);

    if (moment().unix() >= session.absoluteExpireAt) {
      await this.repository.removeSession(userId, sessionId);
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Session expired, please login again');
    }

    if (sentHash !== session.tokenHash) {
      await this.repository.deleteAllSessions(userId);
      throw new Error('Refresh token reuse or invalid — all sessions revoked');
    }

    if (fingerprint !== session.fingerprint) {
      await this.repository.deleteAllSessions(userId);
      throw new Error('Fingerprint mismatch — all sessions revoked');
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
}

export default AuthService;
