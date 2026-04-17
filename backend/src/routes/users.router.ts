import { Router } from 'express';
import { container } from '../container.js';
import { authAccess } from '../middlewares/authAccess.js';

const router = Router();

router.use(authAccess);

router.post('/list', container.usersController.getUsersList);

export default router;
