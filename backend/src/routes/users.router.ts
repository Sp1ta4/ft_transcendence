import { Router } from 'express';
import { container } from '../container.js';
import { authAccess } from '../middlewares/authAccess.js';
import { uploadAvatar } from '../middlewares/avatarUploader.js';

const router = Router();

router.use(authAccess);

router.get('/me', container.usersController.getCurrentUser);

router.get('/:id', container.usersController.getUserById);

router.get('/followers/:id', container.usersController.getUserFollowers);
router.get('/following/:id', container.usersController.getUserFollowing);
router.post('/follow/:id', container.usersController.followUser);
router.post('/unfollow/:id', container.usersController.unfollowUser);

router.post('/update', container.usersController.updateUserProfile);
router.post('/avatar/update', uploadAvatar, container.usersController.updateUserAvatar);
router.delete('/avatar/delete', container.usersController.deleteUserAvatar);

router.post('/search', container.usersController.searchUsers);

export default router;
