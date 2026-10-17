import express from 'express';
import PaymentController, { recordPaymentSchema } from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

router.use(authenticate);

// View payments (admin sees all, member sees own)
router.get('/', PaymentController.getPayments);
router.get('/:id/receipt', PaymentController.getReceipt);

// Admin-only record payment
router.post('/', authorize('ADMIN'), validate(recordPaymentSchema), PaymentController.recordPayment);

export default router;
