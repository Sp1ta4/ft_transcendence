import express from 'express';
import usersRouter from './users.router.js';
import authRouter from './auth.router.js';

const router = express.Router();

router.use('/api/v1/auth', authRouter);
router.use('/api/v1/users', usersRouter);

export default router;