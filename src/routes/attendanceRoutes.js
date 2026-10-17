import express from 'express';
import AttendanceController, {
  checkInSchema,
  checkOutSchema,
  selfCheckInSchema
} from '../controllers/attendanceController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public self check-in endpoint (scanned from facility QR code)
router.post('/self-check-in', apiLimiter, validate(selfCheckInSchema), AttendanceController.selfCheckIn);

// Protected attendance routes
router.use(authenticate);

// View attendance (admins see all, members see their own)
router.get('/', AttendanceController.getAttendance);
router.get('/today', authorize('ADMIN'), AttendanceController.getTodaySummary);

// Mark attendance by admin
router.post('/check-in', authorize('ADMIN'), validate(checkInSchema), AttendanceController.checkIn);
router.post('/check-out', authorize('ADMIN'), validate(checkOutSchema), AttendanceController.checkOut);

export default router;
