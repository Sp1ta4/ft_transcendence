import Joi from 'joi';
import type { IPagination } from '../../types/dtos/IPagination.js';
import validateSchema from '../../utils/validateSchema.js';
import type PostsService from './posts.service.js';
import { StatusCodes } from 'http-status-codes';
import type { Request, Response, NextFunction } from 'express';
import { BAD_REQUEST_ERROR, NOT_FOUND_ERROR } from '../../constants/error_messages.js';

class PostsController {
  private service: PostsService;

  constructor(service: PostsService) {
    this.service = service;
  }

  getPostById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(StatusCodes.BAD_REQUEST).json({ error: BAD_REQUEST_ERROR });
        return;
      }

      const post = await this.service.getPostById(id);
      if (!post) {
        res.status(StatusCodes.NOT_FOUND).json({ error: NOT_FOUND_ERROR });
        return;
      }

      res.status(StatusCodes.OK).json({ post });
    } catch (error) {
      next(error);
    }
  };

  postsList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pagination = validateSchema<IPagination>(req.body, Joi.object({
        limit: Joi.number().integer().min(1).max(100).default(20),
        cursor: Joi.number().integer().optional(),
      }));

      const result = await this.service.postsList(pagination);

      res.status(StatusCodes.OK).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export default PostsController;