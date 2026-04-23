import type { PrismaClient } from '@prisma/client';
import { ACCESS_TTL } from '../../constants/users.js';
import type { Redis } from '../../resources/redis.js';
import type { IAddSessionData, ISessionData } from '../../types/User/IAuthorization.js';
import type { User } from '../../generated/prisma/client.js';
import { StatusCodes } from 'http-status-codes/build/cjs/status-codes.js';
import HttpError from '../../utils/error/HttpError.js';

class AuthRepository {
  readonly cache: Redis;
  private db: PrismaClient;

  constructor(db: PrismaClient, cache: Redis) {
    this.db = db;
    this.cache = cache;
  }

  async addSession(userId: number, data: IAddSessionData): Promise<void> {
    try {
      await this.cache.zAdd(`user:${userId}:sessions`, [{ score: data.score, value: data.value }]);
      await this.cache.expire(`user:${userId}:sessions`, Number(process.env['REFRESH_TTL'] ?? ACCESS_TTL));
    } catch (error) {
      console.log(error);
    }
  }

  async createSession(userId: number, sessionId: string, sessionData: ISessionData): Promise<void> {
    try {
      await this.cache.set(`session:${userId}:${sessionId}`, JSON.stringify(sessionData), {
        EX: Number(process.env['REFRESH_TTL'] ?? ACCESS_TTL),
      });
    } catch (error) {
      console.log(error);
    }
  }

  async getOldestSession(userId: number): Promise<string | undefined> {
    const key = `user:${userId}:sessions`;
    const res = await this.cache.zPopMin(key);
    return res?.value;
  }

  async getSessions(userId: number): Promise<number> {
    return this.cache.zCard(`user:${userId}:sessions`);
  }

  async removeSession(userId: number, sessionId: string): Promise<void> {
    await this.cache.del(`session:${userId}:${sessionId}`);
    await this.cache.zRem(`user:${userId}:sessions`, sessionId);
  }

  async deleteAllSessions(userId: number): Promise<void> {
    const key = `user:${userId}:sessions`;
    const allSessions = await this.cache.zRange(key, 0, -1);
    for (const sessionId of allSessions) {
      await this.removeSession(userId, sessionId);
    }
  }

  async saveTemp2FASecret(userId: number, secret: string): Promise<void> {
    await this.cache.set(`user:${userId}:temp-2fa-secret`, secret, { EX: 60 * 5 });
  }

  async getTemp2FASecret(userId: number): Promise<string | null> {
    return this.cache.get(`user:${userId}:temp-2fa-secret`);
  }
  
  async deleteTemp2FASecret(userId: number): Promise<void> {
    await this.cache.del(`user:${userId}:temp-2fa-secret`);
  }

  async getUserById(id: number): Promise<User | null> {
   return this.db.user.findUnique({ where: { id } });
  }

   async resetPassword(userId: number, passwordHash: string) {
    const user = await this.db.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new HttpError(StatusCodes.NOT_FOUND, 'User not found');
    };
    
    this.db.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
      },
    });
  }
}

export default AuthRepository;
