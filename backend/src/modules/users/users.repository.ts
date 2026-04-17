import type { Redis } from '../../resources/redis.js';
import type { PrismaClient } from '../../resources/prisma.js';

interface CreateUserData {
  first_name: string;
  last_name: string;
  email: string;
  username: string;
  password: string;
  role: string;
  avatar_url?: string;
  birth_date: Date;
}

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

  async createUser(userData: CreateUserData): Promise<number> {
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
}

export default UsersRepository;
