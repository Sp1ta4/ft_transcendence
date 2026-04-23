import { Router }	from 'express';
import authRouter	from './auth.router.js';
import usersRouter	from './users.router.js';
import postsRouter	from './posts.router.js';

const router = Router();

router.use('/api/v1/auth', 	authRouter);
router.use('/api/v1/users', usersRouter);
router.use('/api/v1/posts', postsRouter);

export default router;
