import type { Redis } from '../../resources/redis.js';
import type { PrismaClient } from '../../resources/prisma.js';
import type { ICreateUserData } from '../../types/User/IAuthorization.js';

class UsersRepository {
  private db: PrismaClient;
  private cache: Redis;

  constructor(db: PrismaClient, cache: Redis) {
    this.db = db;
    this.cache = cache;
  }

  async getUserByEmail(email: string) {
    return this.db.user.findUnique({ where: { email } });
  }

  async createUser(userData: ICreateUserData): Promise<number> {
    const user = await this.db.user.create({
      data: {
        first_name: userData.first_name,
        last_name: userData.last_name,
        email: userData.email,
        username: userData.username,
        password_hash: userData.password,
        role: userData.role,
        avatar_url: userData.avatar_url,
        birth_date: new Date(userData.birth_date),
      },
      select: { id: true },
    });
    return user.id;
  }

  async getCachedUser(userId: number, sessionId: string): Promise<string | null> {
    return this.cache.get(`session:${userId}:${sessionId}`);
  }

  async getUsersList() {
    return this.db.user.findMany();
  }

  async getUserById(id: number) {
    return this.db.user.findUnique({ where: { id } });
  }

  async getUserByOAuthId(providerUserId: string, provider: string) {
    return this.db.oAuthAccount.findFirst({
      where: {
        provider: provider,
        provider_user_id: providerUserId,
      },
      include: {
        user: true,
      }
    });
  }

  async upsertUserFromOAuth(data: { 
    email: string;
    name: string;
    avatar: string;
    providerUserId: string;
    provider: string
  }) {
    const oAuthAccount = await this.db.oAuthAccount.upsert({
      where: {
        provider_provider_user_id: {
          provider: data.provider,
          provider_user_id: data.providerUserId,
        },
      },
      update: {
        user: {
          update: {
            avatar_url: data.avatar,
          },
        },
      },
      create: {
        provider: data.provider,
        provider_user_id: data.providerUserId,
        user: {
          create: {
            email: data.email,
            username: await this.generateUniqueUsername(data.email),
            first_name: data.name.split(' ')[0],
            last_name: data.name.split(' ').slice(1).join(' ') || '',
            avatar_url: data.avatar,
          },
        },
      },
      include: {
        user: true,
      },
    });
    return oAuthAccount.user;
  }

  private async generateUniqueUsername(email: string): Promise<string> {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const existing = await this.db.user.findMany({
      where: {
        username: {
          startsWith: base,
        },
      },
      select: { username: true },
    });

    if (existing.length === 0) return base;

    const suffixes = new Set(existing.map(u => u.username));
    let i = 1;
    while (suffixes.has(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  }
}

export default UsersRepository;
