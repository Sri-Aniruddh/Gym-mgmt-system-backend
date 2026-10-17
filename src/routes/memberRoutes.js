import express from 'express';
import MemberController, {
  createMemberSchema,
  updateMemberSchema
} from '../controllers/memberController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

// Apply authentication to all member endpoints
router.use(authenticate);

// Admin-only member management
router.get('/', authorize('ADMIN'), MemberController.getMembers);
router.post('/', authorize('ADMIN'), validate(createMemberSchema), MemberController.createMember);
router.patch('/:id/status', authorize('ADMIN'), MemberController.toggleMemberStatus);
router.post('/:id/resend-invite', authorize('ADMIN'), MemberController.resendInvitation);

// Member or Admin single-member access
router.get('/:id', MemberController.getMemberById);
router.put('/:id', validate(updateMemberSchema), MemberController.updateMember);
router.get('/:id/memberships', MemberController.getMemberMemberships);
router.get('/:id/payments', MemberController.getMemberPayments);
router.get('/:id/attendance', MemberController.getMemberAttendance);

export default router;
