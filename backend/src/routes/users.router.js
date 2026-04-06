import express from 'express';
import { container } from '../container.js';

const router = express.Router();

router.post('/list', container.usersController.getUsersList);

export default router;
