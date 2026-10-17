import { z } from 'zod';
import MembershipPlan from '../models/MembershipPlan.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export const planSchema = z.object({
  name: z.string().min(2, 'Plan name must be at least 2 characters').max(100),
  durationDays: z.number().int().min(1, 'Duration must be at least 1 day'),
  price: z.number().min(0, 'Price cannot be negative'),
  description: z.string().optional().default(''),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional().default('ACTIVE')
});

export class MembershipPlanController {
  /**
   * Get all plans (Public/Active for selection, or all for Admin)
   */
  static async getPlans(req, res) {
    try {
      const isAdmin = req.user?.role === 'ADMIN';
      const query = isAdmin ? {} : { status: 'ACTIVE' };

      const plans = await MembershipPlan.find(query).sort({ price: 1 });
      return successResponse(res, 'Membership plans retrieved', plans);
    } catch (error) {
      return errorResponse(res, 'Failed to fetch membership plans', 500);
    }
  }

  /**
   * Get single plan by ID
   */
  static async getPlanById(req, res) {
    try {
      const plan = await MembershipPlan.findById(req.params.id);
      if (!plan) {
        return errorResponse(res, 'Membership plan not found', 404);
      }
      return successResponse(res, 'Plan details retrieved', plan);
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve plan', 500);
    }
  }

  /**
   * Create new plan (Admin only)
   */
  static async createPlan(req, res) {
    try {
      const { name, durationDays, price, description, status } = req.body;

      const newPlan = await MembershipPlan.create({
        name,
        durationDays,
        price,
        description,
        status
      });

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'PLAN_CREATED',
        targetType: 'MEMBERSHIP_PLAN',
        targetId: newPlan._id.toString(),
        details: { name, price, durationDays }
      });

      return successResponse(res, 'Membership plan created successfully', newPlan, 201);
    } catch (error) {
      return errorResponse(res, 'Failed to create membership plan', 500);
    }
  }

  /**
   * Update plan (Admin only)
   */
  static async updatePlan(req, res) {
    try {
      const plan = await MembershipPlan.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
      });

      if (!plan) {
        return errorResponse(res, 'Membership plan not found', 404);
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'PLAN_UPDATED',
        targetType: 'MEMBERSHIP_PLAN',
        targetId: plan._id.toString(),
        details: req.body
      });

      return successResponse(res, 'Membership plan updated successfully', plan);
    } catch (error) {
      return errorResponse(res, 'Failed to update plan', 500);
    }
  }

  /**
   * Toggle plan status / soft delete
   */
  static async togglePlanStatus(req, res) {
    try {
      const plan = await MembershipPlan.findById(req.params.id);
      if (!plan) {
        return errorResponse(res, 'Membership plan not found', 404);
      }

      plan.status = plan.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await plan.save();

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'PLAN_STATUS_TOGGLED',
        targetType: 'MEMBERSHIP_PLAN',
        targetId: plan._id.toString(),
        details: { newStatus: plan.status }
      });

      return successResponse(res, `Plan status updated to ${plan.status}`, plan);
    } catch (error) {
      return errorResponse(res, 'Failed to toggle plan status', 500);
    }
  }
}

export default MembershipPlanController;
