import express from 'express';
import ReportController from '../controllers/reportController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';

const router = express.Router();

router.use(authenticate);
router.use(authorize('ADMIN'));

router.get('/summary', ReportController.getSummaryReport);
router.get('/audit-logs', ReportController.getAuditLogs);

export default router;
