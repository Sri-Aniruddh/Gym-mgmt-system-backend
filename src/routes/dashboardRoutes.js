import express from 'express';
import DashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';

const router = express.Router();

router.use(authenticate);

// Admin dashboard analytics
router.get('/admin', authorize('ADMIN'), DashboardController.getAdminDashboard);

// Member personalized dashboard
router.get('/member', authorize('MEMBER'), DashboardController.getMemberDashboard);

export default router;
