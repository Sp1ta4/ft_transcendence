import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';import type UsersService from './users.service.js';

class UsersController {
  private service: UsersService;

  constructor(service: UsersService) {
    this.service = service;
  }

  getUsersList = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await this.service.getUsersList();
      res.status(StatusCodes.OK).json({ data: users });
    } catch (err) {
      next(err);
    }
  };
}

export default UsersController;
