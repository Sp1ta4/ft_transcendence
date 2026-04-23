import type PostsRepository from './posts.repository.js';
import type { IPagination, IPaginatedResult } from '../../types/dtos/IPagination.js';
import type { Post } from '../../generated/prisma/client.js';

class PostsService {
  private repository: PostsRepository;

  constructor(repository: PostsRepository) {
    this.repository = repository;
  }

  async postsList(pagination: IPagination): Promise<IPaginatedResult<Post>> {
    return this.repository.postsList(pagination);
  }

  async getPostById(id: number): Promise<Post | null> {
    return this.repository.getPostById(id);
  }
}

export default PostsService;