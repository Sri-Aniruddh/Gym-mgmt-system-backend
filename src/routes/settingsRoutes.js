import express from 'express';
import SettingsController, { updateSettingsSchema } from '../controllers/settingsController.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';

const router = express.Router();

// Allow reading gym settings (e.g. gym name & currency)
router.get('/', SettingsController.getSettings);

// Admin-only updates
router.put('/', authenticate, authorize('ADMIN'), validate(updateSettingsSchema), SettingsController.updateSettings);

export default router;
