import { Router } from 'express';
import * as team from '../controllers/team.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);
router.get('/', team.myTeam);
router.get('/tasks', team.teamTasks);
router.post('/tasks', team.assignTask);
router.delete('/tasks/:id', team.recallTask);

export default router;
