import type { Redis } from '../../resources/redis.js';
import type { PrismaClient } from '../../resources/prisma.js';
import type { Post } from '../../generated/prisma/client.js';
import type { IPagination, IPaginatedResult } from '../../types/dtos/IPagination.js';

class PostsRepository {
  private db: PrismaClient;
  private cache: Redis;

  private readonly POST_TTL = 60 * 60;   // 1 hour
  private readonly LIST_TTL = 60 * 2;    // 2 minutes

  constructor(db: PrismaClient, cache: Redis) {
    this.db = db;
    this.cache = cache;
  }

  postsList = async ({ limit, cursor }: IPagination): Promise<IPaginatedResult<Post>> => {
    if (cursor !== undefined) {
      const listKey = `posts:list:limit=${limit}:cursor=${cursor}`;
      const cachedIds = await this.cache.get(listKey);

      if (cachedIds) {
        const ids: number[] = JSON.parse(cachedIds);
        const items = await this.getManyByIds(ids);
        const nextCursor = items.length === limit ? items[items.length - 1].id : null;
        return { items, nextCursor };
      }
    }

    const posts = await this.db.post.findMany({
      take: limit,
      ...(cursor !== undefined && {
        skip: 1,
        cursor: { id: cursor },
      }),
      orderBy: { created_at: 'desc' },
    });

    if (cursor !== undefined) {
      const listKey = `posts:list:limit=${limit}:cursor=${cursor}`;
      const postIds = posts.map(p => p.id);
      await this.cache.set(listKey, JSON.stringify(postIds), { EX: this.LIST_TTL });
    }

    await Promise.all(posts.map(p => this.cachePost(p)));

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;
    return { items: posts, nextCursor };
  };

  getPostById = async (id: number): Promise<Post | null> => {
    const cached = await this.cache.get(`post:${id}`);
    if (cached) return JSON.parse(cached) as Post;

    const post = await this.db.post.findUnique({ where: { id } });
    if (post) await this.cachePost(post);
    return post;
  };

  private getManyByIds = async (ids: number[]): Promise<Post[]> => {
    if (ids.length === 0) return [];

    const cached = (await this.cache.mget(...ids.map(id => `post:${id}`)) ?? []) as (string | null)[];

    const posts: Post[] = [];
    const missedIds: number[] = [];

    cached.forEach((raw, i) => {
      if (raw) posts.push(JSON.parse(raw));
      else missedIds.push(ids[i]);
    });

    if (missedIds.length > 0) {
      const fromDb = await this.db.post.findMany({
        where: { id: { in: missedIds } },
      });
      await Promise.all(fromDb.map(p => this.cachePost(p)));
      posts.push(...fromDb);
    }

    return ids.map(id => posts.find(p => p.id === id)).filter(Boolean) as Post[];
  };

  private cachePost = async (post: Post): Promise<void> => {
    await this.cache.set(`post:${post.id}`, JSON.stringify(post), { EX: this.POST_TTL });
  };
}

export default PostsRepository;