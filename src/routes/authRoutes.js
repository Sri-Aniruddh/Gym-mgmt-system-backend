import express from 'express';
import AuthController, {
  loginSchema,
  firstTimePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  setupPasswordSchema
} from '../controllers/authController.js';
import { authenticate, allowFirstLoginOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Public auth endpoints
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/first-time-password', allowFirstLoginOnly, validate(firstTimePasswordSchema), AuthController.firstTimePassword);
router.get('/verify-invitation', authLimiter, AuthController.verifyInvitationToken);
router.post('/setup-password', authLimiter, validate(setupPasswordSchema), AuthController.setupPassword);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/forgot-password', authLimiter, validate(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/reset-password', authLimiter, validate(resetPasswordSchema), AuthController.resetPassword);

// Authenticated endpoints
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.getMe);
router.put('/change-password', authenticate, validate(changePasswordSchema), AuthController.changePassword);

export default router;
