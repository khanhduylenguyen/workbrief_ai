import { Router } from 'express';
import * as guides from '../controllers/guide.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.post('/ai-extract', guides.extract);
router.get('/', guides.list);
router.post('/', guides.create);
router.get('/:id', guides.get);
router.patch('/:id', guides.update);
router.delete('/:id', guides.remove);
router.post('/:id/tasks', guides.createTasks);

export default router;
