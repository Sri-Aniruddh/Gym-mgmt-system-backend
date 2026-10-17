import express from 'express';
import MembershipController, {
  assignPlanSchema,
  renewPlanSchema
} from '../controllers/membershipController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(authenticate);

// Admin-only actions
router.post('/assign', authorize('ADMIN'), validate(assignPlanSchema), MembershipController.assignPlan);
router.post('/renew', authorize('ADMIN'), validate(renewPlanSchema), MembershipController.renewMembership);
router.patch('/:id/cancel', authorize('ADMIN'), MembershipController.cancelMembership);

export default router;
