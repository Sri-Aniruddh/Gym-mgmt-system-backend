import { z } from 'zod';
import mongoose from 'mongoose';
import Payment from '../models/Payment.js';
import Member from '../models/Member.js';
import Membership from '../models/Membership.js';
import MembershipPlan from '../models/MembershipPlan.js';
import User from '../models/User.js';
import GymSettings from '../models/GymSettings.js';
import EmailService from '../services/emailService.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/apiResponse.js';

export const recordPaymentSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
  membershipId: z.string().optional(),
  planId: z.string().optional(),
  amount: z.number().positive('Payment amount must be greater than 0'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER']).default('CASH'),
  transactionReference: z.string().optional(),
  paymentDate: z.string().optional(),
  sendReceiptEmail: z.boolean().optional().default(true),
  notes: z.string().optional()
});

export class PaymentController {
  /**
   * Record a new payment (Admin only)
   */
  static async recordPayment(req, res) {
    try {
      const {
        memberId,
        membershipId,
        planId,
        amount,
        paymentMethod,
        transactionReference,
        paymentDate,
        sendReceiptEmail,
        notes
      } = req.body;

      // Find member
      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(memberId) ? [{ _id: memberId }] : []),
          { memberId: memberId.toUpperCase() }
        ]
      }).populate('userId', 'name email');

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      // Generate or validate transaction reference
      const finalTxnRef = (transactionReference || `TXN-${member.memberId}-${Date.now()}`).trim().toUpperCase();

      // Check duplicate transaction reference for idempotency
      const existingPayment = await Payment.findOne({ transactionReference: finalTxnRef });
      if (existingPayment) {
        return errorResponse(
          res,
          `A payment with transaction reference '${finalTxnRef}' has already been recorded.`,
          409
        );
      }

      // Resolve or create membership if a plan was selected
      let targetMembershipId = membershipId;

      if (planId && mongoose.isValidObjectId(planId)) {
        const plan = await MembershipPlan.findById(planId);
        if (plan) {
          const now = new Date();
          // Check if member already has an active membership ending in the future
          const existingActiveMem = await Membership.findOne({
            memberRef: member._id,
            status: 'ACTIVE',
            endDate: { $gt: now }
          }).sort({ endDate: -1 });

          const startDate = existingActiveMem ? new Date(existingActiveMem.endDate) : now;
          const endDate = new Date(startDate.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

          const newMembership = await Membership.create({
            memberId: member.memberId,
            memberRef: member._id,
            planId: plan._id,
            startDate,
            endDate,
            status: 'ACTIVE',
            notes: `Auto-assigned via Payment ${finalTxnRef}`
          });

          member.membershipId = newMembership._id;
          member.status = 'ACTIVE';
          await member.save();

          if (member.userId?._id) {
            await User.findByIdAndUpdate(member.userId._id, { status: 'ACTIVE' });
          }

          targetMembershipId = newMembership._id;
        }
      } else if (!targetMembershipId && member.membershipId) {
        targetMembershipId = member.membershipId;
      }

      const payment = await Payment.create({
        memberId: member.memberId,
        memberRef: member._id,
        membershipId: targetMembershipId || undefined,
        amount,
        paymentMethod,
        transactionReference: finalTxnRef,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        status: 'COMPLETED',
        recordedBy: req.user.id,
        notes: notes || ''
      });

      // Optionally dispatch receipt email via Gmail SMTP
      if (sendReceiptEmail && member.userId?.email) {
        let planName = 'Gym Membership';
        if (targetMembershipId) {
          const mem = await Membership.findById(targetMembershipId).populate('planId');
          if (mem?.planId?.name) planName = mem.planId.name;
        }

        // Fire-and-forget email dispatch
        EmailService.sendPaymentReceipt({
          memberName: member.userId.name,
          email: member.userId.email,
          memberId: member.memberId,
          amount,
          paymentMethod,
          transactionReference: finalTxnRef,
          paymentDate: payment.paymentDate,
          planName
        }).catch((err) => console.error('[PaymentController] Receipt email failed:', err.message));
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'PAYMENT_RECORDED',
        targetType: 'PAYMENT',
        targetId: payment._id.toString(),
        details: { memberId: member.memberId, amount, paymentMethod, reference: finalTxnRef }
      });

      return successResponse(res, `Payment of ${amount} recorded successfully`, payment, 201);
    } catch (error) {
      console.error('[PaymentController.recordPayment]', error);
      return errorResponse(res, 'Failed to record payment', 500);
    }
  }

  /**
   * Get payments with search, filters, and pagination
   */
  static async getPayments(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const memberId = req.query.memberId;
      const paymentMethod = req.query.paymentMethod;
      const startDate = req.query.startDate;
      const endDate = req.query.endDate;
      const search = (req.query.search || '').trim();

      const query = {};

      // If requested by a member, restrict to their own records
      if (req.user.role === 'MEMBER') {
        query.memberId = req.user.memberId;
      } else if (memberId) {
        query.memberId = memberId.toUpperCase();
      }

      if (paymentMethod) {
        query.paymentMethod = paymentMethod;
      }

      if (startDate || endDate) {
        query.paymentDate = {};
        if (startDate) query.paymentDate.$gte = new Date(startDate);
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          query.paymentDate.$lte = end;
        }
      }

      if (search) {
        query.$or = [
          { memberId: { $regex: search, $options: 'i' } },
          { transactionReference: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await Payment.countDocuments(query);

      const payments = await Payment.find(query)
        .populate({
          path: 'memberRef',
          select: 'phone profileImageUrl',
          populate: { path: 'userId', select: 'name email' }
        })
        .populate({
          path: 'membershipId',
          populate: { path: 'planId', select: 'name durationDays' }
        })
        .populate('recordedBy', 'name email')
        .sort({ paymentDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return paginatedResponse(res, 'Payments retrieved successfully', payments, {
        total,
        page,
        limit
      });
    } catch (error) {
      console.error('[PaymentController.getPayments]', error);
      return errorResponse(res, 'Failed to retrieve payments', 500);
    }
  }

  /**
   * Get detailed printable receipt data
   */
  static async getReceipt(req, res) {
    try {
      const { id } = req.params;

      const payment = await Payment.findOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { transactionReference: id.toUpperCase() }
        ]
      })
        .populate({
          path: 'memberRef',
          select: 'phone address profileImageUrl memberId',
          populate: { path: 'userId', select: 'name email' }
        })
        .populate({
          path: 'membershipId',
          populate: { path: 'planId' }
        })
        .populate('recordedBy', 'name email');

      if (!payment) {
        return errorResponse(res, 'Payment receipt not found', 404);
      }

      // Security check for MEMBER
      if (req.user.role === 'MEMBER' && payment.memberId !== req.user.memberId) {
        return errorResponse(res, 'Access denied', 403);
      }

      const gymSettings = await GymSettings.getSettings();

      return successResponse(res, 'Receipt details retrieved', {
        payment,
        gymSettings
      });
    } catch (error) {
      console.error('[PaymentController.getReceipt]', error);
      return errorResponse(res, 'Failed to fetch receipt', 500);
    }
  }
}

export default PaymentController;
