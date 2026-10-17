import express from 'express';
import MembershipPlanController, { planSchema } from '../controllers/membershipPlanController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

// Allow authenticated users to view active plans
router.get('/', authenticate, MembershipPlanController.getPlans);
router.get('/:id', authenticate, MembershipPlanController.getPlanById);

// Admin-only management
router.post('/', authenticate, authorize('ADMIN'), validate(planSchema), MembershipPlanController.createPlan);
router.put('/:id', authenticate, authorize('ADMIN'), validate(planSchema.partial()), MembershipPlanController.updatePlan);
router.patch('/:id/status', authenticate, authorize('ADMIN'), MembershipPlanController.togglePlanStatus);

export default router;
