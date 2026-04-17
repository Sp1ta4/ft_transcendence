import { ACCESS_TTL } from '../../constants/users.js';
import type { Redis } from '../../resources/redis.js';

interface SessionData {
  tokenHash: string;
  fingerprint: string;
  createdAt: number;
  absoluteExpireAt: number;
}

interface AddSessionData {
  value: string;
  score: number;
}

class AuthRepository {
  readonly cache: Redis;

  constructor(_db: unknown, cache: Redis) {
    this.cache = cache;
  }

  async addSession(userId: number, data: AddSessionData): Promise<void> {
    try {
      await this.cache.zAdd(`user:${userId}:sessions`, [{ score: data.score, value: data.value }]);
      await this.cache.expire(`user:${userId}:sessions`, Number(process.env['REFRESH_TTL'] ?? ACCESS_TTL));
    } catch (error) {
      console.log(error);
    }
  }

  async createSession(userId: number, sessionId: string, sessionData: SessionData): Promise<void> {
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

}

export default AuthRepository;
