import { Router } from 'express';
import * as tasks from '../controllers/task.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Static paths must be registered before "/:id".
router.post('/ai-summarize', tasks.aiSummarize);
router.get('/stats', tasks.getStats);

router.get('/', tasks.listTasks);
router.post('/', tasks.createTask);
router.get('/:id', tasks.getTask);
router.patch('/:id', tasks.updateTask);
router.delete('/:id', tasks.deleteTask);
router.patch('/:id/checklist/:itemId', tasks.toggleChecklistItem);
router.patch('/:id/status', tasks.updateTaskStatus);
router.get('/:id/activities', tasks.getTaskActivities);

export default router;
