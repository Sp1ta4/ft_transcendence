import prisma           from './resources/prisma.js';
import redis            from './resources/redis.js';

import StorageService   from './resources/s3.js';

import AuthRepository   from './modules/auth/auth.repository.js';
import AuthService      from './modules/auth/auth.service.js';
import AuthController   from './modules/auth/auth.controller.js';

import UsersRepository  from './modules/users/users.repository.js';
import UsersService     from './modules/users/users.service.js';
import UsersController  from './modules/users/users.controller.js';

import PostsRepository  from './modules/posts/posts.repository.js';
import PostsService     from './modules/posts/posts.service.js';
import PostsController  from './modules/posts/posts.controller.js';

const storageService  = new StorageService();

const usersRepository = new UsersRepository(prisma, redis);
const usersService    = new UsersService(usersRepository, storageService);
const usersController = new UsersController(usersService);

const postsRepository = new PostsRepository(prisma, redis);
const postsService    = new PostsService(postsRepository);
const postsController = new PostsController(postsService);


const authRepository  = new AuthRepository(prisma, redis);
const authService     = new AuthService(authRepository, usersRepository);
const authController  = new AuthController(authService);

export const container = {
  prisma,
  redis,
  storageService,

  usersRepository,
  usersService,
  usersController,

  authRepository,
  authService,
  authController,

  postsRepository,
  postsService,
  postsController,
};
