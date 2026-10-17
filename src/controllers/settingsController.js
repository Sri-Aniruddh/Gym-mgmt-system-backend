import { z } from 'zod';
import GymSettings from '../models/GymSettings.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export const updateSettingsSchema = z.object({
  gymName: z.string().min(2, 'Gym name must be at least 2 characters').max(100).optional(),
  contactEmail: z.string().email('Please enter a valid email address').optional(),
  contactPhone: z.string().min(5).optional(),
  address: z.string().min(3).optional(),
  currency: z.string().min(1).max(5).optional(),
  currencySymbol: z.string().min(1).max(5).optional(),
  receiptFooter: z.string().optional(),
  logoUrl: z.string().optional()
});

export class SettingsController {
  /**
   * Get Gym Settings
   */
  static async getSettings(req, res) {
    try {
      const settings = await GymSettings.getSettings();
      return successResponse(res, 'Gym settings retrieved', settings);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch settings', 500);
    }
  }

  /**
   * Update Gym Settings (Admin only)
   */
  static async updateSettings(req, res) {
    try {
      let settings = await GymSettings.findOne();
      if (!settings) {
        settings = new GymSettings({});
      }

      Object.assign(settings, req.body);
      settings.updatedBy = req.user.id;
      await settings.save();

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'SETTINGS_UPDATED',
        targetType: 'SETTINGS',
        targetId: settings._id.toString(),
        details: req.body
      });

      return successResponse(res, 'Gym settings updated successfully', settings);
    } catch (error) {
      console.error('[SettingsController.updateSettings]', error);
      return errorResponse(res, 'Failed to update settings', 500);
    }
  }
}

export default SettingsController;
