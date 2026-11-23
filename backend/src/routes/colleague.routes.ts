import { Router } from 'express';
import * as colleagues from '../controllers/colleague.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', colleagues.listColleagues);
router.post('/', colleagues.createColleague);
router.get('/:id', colleagues.getColleague);
router.patch('/:id', colleagues.updateColleague);
router.delete('/:id', colleagues.deleteColleague);

export default router;
