import { Router } from 'express';
import { authAccess } from '../middlewares/authAccess.js';
import { container } from '../container.js';

const router = Router();

router.use(authAccess);

router.get('/:id', container.postsController.getPostById);
router.get('/:id/likes', container.postsController.getPostLikes);
route.post('/:id/likes', container.postsController.togglePostLike);
router.get('/:id/comments', container.postsController.getPostComments);
router.post('/:id/comments', container.postsController.createPostComment);
router.post('/list', container.postsController.postsList);

export default router;
