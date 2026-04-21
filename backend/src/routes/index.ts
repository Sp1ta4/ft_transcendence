import { Router } from 'express';
import authRouter from './auth.router.js';
import usersRouter from './users.router.js';

const router = Router();

router.use('/api/v1/auth', authRouter);
router.use('/api/v1/users', usersRouter);

export default router;
