import { Router } from 'express';
import { container } from '../container.js';
import { authAccess } from '../middlewares/authAccess.js';

const router = Router();

router.post('/register', container.authController.register);
router.post('/confirm', container.authController.confirm);
router.post('/refresh', container.authController.refresh);
router.post('/login', container.authController.login);
router.post('/logout', container.authController.logout);
router.get('/validate', container.authController.validateToken);

router.post('/oauth/initiate/google', container.authController.initiateGoogleOAuth);
router.get('/oauth/callback/google', container.authController.handleGoogleOAuthCallback);

router.get('/me', authAccess, container.authController.getCurrentUser);

export default router;
