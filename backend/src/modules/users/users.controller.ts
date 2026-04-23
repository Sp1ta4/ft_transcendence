import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';import type UsersService from './users.service.js';
import { BAD_REQUEST_ERROR, NOT_FOUND_ERROR, UNAUTHORIZED_ERROR } from '../../constants/error_messages.js';
import validateSchema from '../../utils/validateSchema.js';
import Joi from 'joi';
import type { IUserProfileUpdate } from '../../types/User/IUserProfile.js';

class UsersController {
  private service: UsersService;

  constructor(service: UsersService) {
    this.service = service;
  }

  getCurrentUser = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(res.locals.userId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.UNAUTHORIZED).json({ error: UNAUTHORIZED_ERROR });
        return;
      }

      const user = await this.service.getUserById(id, id);
      res.status(StatusCodes.OK).json({ user });
    } catch (err) {
      next(err);
    }
  };

  getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      const requesterId = Number(res.locals.userId);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      const user = await this.service.getUserById(id, requesterId);
      if (!user) {
        res.status(StatusCodes.NOT_FOUND).json({ error: NOT_FOUND_ERROR });
        return;
      }

      res.status(StatusCodes.OK).json({ user });
    } catch (err) {
      next(err);
    }
  }

  getUserFollowers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      const followers = await this.service.getUserFollowers(id);
      res.status(StatusCodes.OK).json({ followers });
    }
    catch (err) {
      next(err);
    }
  }

  getUserFollowing = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      const following = await this.service.getUserFollowing(id);
      res.status(StatusCodes.OK).json({ following });
    }
    catch (err) {
      next(err);
    }
  }

  followUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(res.locals.userId);
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      await this.service.followUser(userId, targetId);
      res.status(StatusCodes.OK).json({ message: 'User followed successfully' });
    }
    catch (err) {
      next(err);
    }
  }

  unfollowUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(res.locals.userId);
      const targetId = Number(req.params.id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      await this.service.unfollowUser(userId, targetId);
      res.status(StatusCodes.OK).json({ message: 'User unfollowed successfully' });
    }
    catch (err) {
      next(err);
    }
  }

  updateUserProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(res.locals.userId);

      const userData = validateSchema<IUserProfileUpdate>(req.body, Joi.object({
        first_name: Joi.string().min(2).max(42).optional(),
        last_name:  Joi.string().min(2).max(42).optional(),
        username:   Joi.string().alphanum().min(3).max(30).optional(),
        avatarUrl:  Joi.string().uri().optional(),
        bio:        Joi.string().max(60).optional(),
        birth_date: Joi.date().less('now').optional(),
      }));

      const updatedUser = await this.service.updateUserProfile(userId, userData);
      res.status(StatusCodes.OK).json({ user: updatedUser });
    }
    catch (err) {
      next(err);
    }
  }

  updateUserAvatar = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        res.status(StatusCodes.BAD_REQUEST).json({ message: 'No file provided' });
        return;
      }

      const userId = Number(res.locals.userId);
      const updatedUser = await this.service.updateUserAvatar(userId, req.file);

      res.status(StatusCodes.OK).json({ user: updatedUser });
    } catch (err) {
      next(err);
    }
  };

  deleteUserAvatar = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(res.locals.userId);
      const updatedUser = await this.service.deleteUserAvatar(userId);

      res.status(StatusCodes.OK).json({ user: updatedUser });
    } catch (err) {
      next(err);
    }
  };

  searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { limit, query } = validateSchema<{ limit: number; query: string }>(req.body, Joi.object({
        query: Joi.string().min(1).max(100).required(),
        limit: Joi.number().integer().min(1).max(100).optional().default(10),
      }));

      const users = await this.service.searchUsers(query, limit);
      res.status(StatusCodes.OK).json({ users });
    }
    catch (err) {
      next(err);
    }
  }
}

export default UsersController;
