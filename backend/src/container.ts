import prisma from './resources/prisma.js';
import redis from './resources/redis.js';

import AuthRepository from './modules/auth/auth.repository.js';
import AuthService from './modules/auth/auth.service.js';
import AuthController from './modules/auth/auth.controller.js';

import UsersRepository from './modules/users/users.repository.js';
import UsersService from './modules/users/users.service.js';
import UsersController from './modules/users/users.controller.js';

const usersRepository = new UsersRepository(prisma, redis);
const usersService = new UsersService(usersRepository);
const usersController = new UsersController(usersService);

const authRepository = new AuthRepository(prisma, redis);
const authService = new AuthService(authRepository, usersRepository);
const authController = new AuthController(authService);

export const container = {
  prisma,
  redis,

  usersRepository,
  usersService,
  usersController,

  authRepository,
  authService,
  authController,
};
