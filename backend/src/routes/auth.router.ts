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

router.post('/reset-password', container.authController.resetPassword);

router.post('/oauth/initiate/google', container.authController.initiateOAuth);
router.get('/oauth/callback/google', container.authController.handleGoogleOAuthCallback);

router.get('/2fa/setup', authAccess, container.authController.setup2FA);
router.post('/2fa/enable', authAccess, container.authController.enable2FA);
router.delete('/2fa/disable', authAccess, container.authController.disable2FA);

router.post('/oauth/initiate/github', container.authController.initiateOAuth);
router.get('/oauth/callback/github', container.authController.handleGithubOAuthCallback);

export default router;
