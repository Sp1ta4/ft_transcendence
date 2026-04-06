import express from 'express';
import { container } from '../container.js';

const router = express.Router();

router.post('/register', container.authController.register);
router.post('/confirm', container.authController.confirm);
router.post('/refresh', container.authController.refresh);
router.post('/login', container.authController.login);
router.post('/logout', container.authController.logout);
router.get('/validate', container.authController.validateToken);

export default router;
