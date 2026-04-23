import type { Redis } from '../../resources/redis.js';
import type { PrismaClient } from '../../resources/prisma.js';
import type { ICreateUserData } from '../../types/User/IAuthorization.js';

class UsersRepository {
  private db: PrismaClient;
  private cache: Redis;

  private readonly MAX_CACHED_USERS = 500;
  private readonly USER_TTL = 60 * 60 * 24; // 1 day
  private readonly USER_HITS_KEY = 'users:cache:hits';

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

  async getUserById(id: number) {
    const cacheKey = `user:${id}`;
    const cached = await this.cache.get(cacheKey);

    if (cached) {
      await this.cache.zincrby(this.USER_HITS_KEY, 1, cacheKey);
      return JSON.parse(cached) as Awaited<ReturnType<typeof this._fetchUserById>>;
    }

    await this.cache.zrem(this.USER_HITS_KEY, cacheKey);

    const user = await this._fetchUserById(id);
    if (!user) return null;

    const cacheSize = await this.cache.zcard(this.USER_HITS_KEY);
    if (cacheSize >= this.MAX_CACHED_USERS) {
      const [lfuKey] = await this.cache.zrange(this.USER_HITS_KEY, 0, 0);
      if (lfuKey) {
        await this.cache.del(lfuKey);
        await this.cache.zrem(this.USER_HITS_KEY, lfuKey);
      }
    }

    await this.cache.set(cacheKey, JSON.stringify(user), { EX: this.USER_TTL });
    await this.cache.zadd(this.USER_HITS_KEY, 1, cacheKey);
    return user;
  }

  private async _fetchUserById(id: number) {
    return this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        username: true,
        avatar_url: true,
        bio: true,
        role: true,
        is_verified: true,
        is_online: true,
        last_seen: true,
        birth_date: true,
        created_at: true,
        _count: {
          select: {
            followers: true,
            following: true,
          },
        },
      },
    });
  }

  async getUserEmailById(id: number): Promise<string | null> {
    const user = await this.db.user.findUnique({
      where: { id },
      select: { email: true },
    });
    return user ? user.email : null;
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
    await this.cache.del(`user:${oAuthAccount.user.id}`);
    await this.cache.zrem(this.USER_HITS_KEY, `user:${oAuthAccount.user.id}`);
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

  async updateUser(id: number, data: Partial<{
    first_name: string;
    last_name: string;
    email: string;
    username: string;
    password_hash: string;
    role: string;
    avatar_url: string;
    birth_date: Date;
    two_factor_enabled: boolean;
    two_factor_secret: string | null;
  }>) {
    const result = await this.db.user.update({ where: { id }, data });
    await this.cache.del(`user:${id}`);
    await this.cache.zrem(this.USER_HITS_KEY, `user:${id}`);
    return result;
  }

  async areFriends(userId: number, otherId: number): Promise<boolean> {
    const count = await this.db.follow.count({
      where: {
        OR: [
          { follower_id: userId, following_id: otherId },
          { follower_id: otherId, following_id: userId },
        ],
      },
    });
    return count === 2;
  }

  async getUserFollowers(id: number) {
    return this.db.follow.findMany({
      where: { following_id: id },
      include: {
        follower: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
            avatar_url: true,
          },
        },
      },
    });
  }

  async getUserFollowing(id: number) {
    return this.db.follow.findMany({
      where: { follower_id: id },
      include: {
        following: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            username: true,
            avatar_url: true,
          },
        },
      },
    });
  }

  async followUser(userId: number, targetUserId: number) {
    return this.db.follow.create({
      data: {
        follower_id: userId,
        following_id: targetUserId,
      },
    });
  }

  async unfollowUser(userId: number, targetUserId: number) {
    return this.db.follow.delete({
      where: {
        follower_id_following_id: {
          follower_id: userId,
          following_id: targetUserId,
        },
      },
    });
  }

  async updateUserProfile(userId: number, profileData: Partial<{
    first_name: string;
    last_name: string;
    username: string;
    avatar_url: string | null;
    bio: string;
  }>) {
    const result = await this.db.user.update({ where: { id: userId }, data: profileData });
    await this.cache.del(`user:${userId}`);
    await this.cache.zrem(this.USER_HITS_KEY, `user:${userId}`);
    return result;
  }

  async getUsersList(query: string, limit: number) {
    return this.db.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { first_name: { contains: query, mode: 'insensitive' } },
          { last_name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
    });
  }
}

export default UsersRepository;
