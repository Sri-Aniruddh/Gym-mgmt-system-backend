import { z } from 'zod';
import mongoose from 'mongoose';
import Membership from '../models/Membership.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Member from '../models/Member.js';
import Payment from '../models/Payment.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export const assignPlanSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
  planId: z.string().min(1, 'Plan ID is required'),
  startDate: z.string().optional(),
  notes: z.string().optional(),
  recordPayment: z.boolean().optional().default(false),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER']).optional().default('CASH'),
  amountPaid: z.number().optional()
});

export const renewPlanSchema = z.object({
  membershipId: z.string().min(1, 'Membership ID is required'),
  planId: z.string().optional(), // If changing plan upon renewal
  notes: z.string().optional(),
  recordPayment: z.boolean().optional().default(false),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER']).optional().default('CASH'),
  amountPaid: z.number().optional()
});

export class MembershipController {
  /**
   * Assign or switch plan for member
   */
  static async assignPlan(req, res) {
    try {
      const { memberId, planId, startDate, notes, recordPayment, paymentMethod, amountPaid } = req.body;

      // Find member
      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(memberId) ? [{ _id: memberId }] : []),
          { memberId: memberId.toUpperCase() }
        ]
      });

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      const plan = await MembershipPlan.findById(planId);
      if (!plan || plan.status !== 'ACTIVE') {
        return errorResponse(res, 'Selected membership plan is invalid or inactive', 400);
      }

      // Mark any currently active memberships for this member as CANCELLED or EXPIRED
      await Membership.updateMany(
        { memberRef: member._id, status: 'ACTIVE' },
        { status: 'CANCELLED', notes: 'Superseded by new membership assignment' }
      );

      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.durationDays);

      const newMembership = await Membership.create({
        memberId: member.memberId,
        memberRef: member._id,
        planId: plan._id,
        startDate: start,
        endDate: end,
        status: 'ACTIVE',
        notes: notes || `Assigned ${plan.name} by admin`
      });

      member.membershipId = newMembership._id;
      member.status = 'ACTIVE';
      await member.save();

      // Record optional payment
      let paymentRecord = null;
      if (recordPayment && (amountPaid || plan.price)) {
        const payAmount = amountPaid !== undefined ? amountPaid : plan.price;
        paymentRecord = await Payment.create({
          memberId: member.memberId,
          memberRef: member._id,
          membershipId: newMembership._id,
          amount: payAmount,
          paymentMethod: paymentMethod || 'CASH',
          transactionReference: `TXN-${member.memberId}-${Date.now()}`,
          paymentDate: new Date(),
          status: 'COMPLETED',
          recordedBy: req.user.id,
          notes: `Payment for plan assignment: ${plan.name}`
        });
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'PLAN_ASSIGNED',
        targetType: 'MEMBERSHIP',
        targetId: newMembership._id.toString(),
        details: { memberId: member.memberId, plan: plan.name, endDate: end }
      });

      return successResponse(res, `Successfully assigned ${plan.name} to member ${member.memberId}`, {
        membership: newMembership,
        payment: paymentRecord
      });
    } catch (error) {
      console.error('[MembershipController.assignPlan]', error);
      return errorResponse(res, 'Failed to assign plan', 500);
    }
  }

  /**
   * Renew membership
   */
  static async renewMembership(req, res) {
    try {
      const { membershipId, planId, notes, recordPayment, paymentMethod, amountPaid } = req.body;

      const currentMembership = await Membership.findById(membershipId).populate('planId');
      if (!currentMembership) {
        return errorResponse(res, 'Membership not found', 404);
      }

      const member = await Member.findById(currentMembership.memberRef);
      if (!member) {
        return errorResponse(res, 'Member associated with membership not found', 404);
      }

      // Determine target plan
      const targetPlanId = planId || currentMembership.planId._id;
      const plan = await MembershipPlan.findById(targetPlanId);
      if (!plan || plan.status !== 'ACTIVE') {
        return errorResponse(res, 'Selected plan is inactive or invalid', 400);
      }

      // Calculate start date: if current membership is still active, extend from its endDate; else extend from today
      const now = new Date();
      let start = now;
      if (currentMembership.status === 'ACTIVE' && new Date(currentMembership.endDate) > now) {
        start = new Date(currentMembership.endDate);
      }

      const end = new Date(start);
      end.setDate(end.getDate() + plan.durationDays);

      // Mark current membership as EXPIRED or superseded if new one created
      currentMembership.status = 'EXPIRED';
      await currentMembership.save();

      const renewedMembership = await Membership.create({
        memberId: member.memberId,
        memberRef: member._id,
        planId: plan._id,
        startDate: start,
        endDate: end,
        status: 'ACTIVE',
        notes: notes || `Renewed for ${plan.name}`
      });

      member.membershipId = renewedMembership._id;
      member.status = 'ACTIVE';
      await member.save();

      let paymentRecord = null;
      if (recordPayment && (amountPaid || plan.price)) {
        const payAmount = amountPaid !== undefined ? amountPaid : plan.price;
        paymentRecord = await Payment.create({
          memberId: member.memberId,
          memberRef: member._id,
          membershipId: renewedMembership._id,
          amount: payAmount,
          paymentMethod: paymentMethod || 'CASH',
          transactionReference: `TXN-${member.memberId}-${Date.now()}`,
          paymentDate: new Date(),
          status: 'COMPLETED',
          recordedBy: req.user.id,
          notes: `Renewal payment for ${plan.name}`
        });
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'MEMBERSHIP_RENEWED',
        targetType: 'MEMBERSHIP',
        targetId: renewedMembership._id.toString(),
        details: { memberId: member.memberId, plan: plan.name, newEndDate: end }
      });

      return successResponse(res, `Membership renewed successfully until ${end.toLocaleDateString()}`, {
        membership: renewedMembership,
        payment: paymentRecord
      });
    } catch (error) {
      console.error('[MembershipController.renewMembership]', error);
      return errorResponse(res, 'Failed to renew membership', 500);
    }
  }

  /**
   * Cancel membership
   */
  static async cancelMembership(req, res) {
    try {
      const { id } = req.params;
      const membership = await Membership.findById(id);

      if (!membership) {
        return errorResponse(res, 'Membership not found', 404);
      }

      membership.status = 'CANCELLED';
      await membership.save();

      // Check if member has other active memberships
      const otherActive = await Membership.findOne({
        memberRef: membership.memberRef,
        status: 'ACTIVE',
        _id: { $ne: membership._id }
      });

      if (!otherActive) {
        await Member.findByIdAndUpdate(membership.memberRef, { status: 'INACTIVE' });
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'MEMBERSHIP_CANCELLED',
        targetType: 'MEMBERSHIP',
        targetId: membership._id.toString(),
        details: { memberId: membership.memberId }
      });

      return successResponse(res, 'Membership cancelled successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to cancel membership', 500);
    }
  }
}

export default MembershipController;
