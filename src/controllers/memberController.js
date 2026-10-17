import { z } from 'zod';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Member from '../models/Member.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Membership from '../models/Membership.js';
import Payment from '../models/Payment.js';
import Attendance from '../models/Attendance.js';
import TokenService from '../services/tokenService.js';
import EmailService from '../services/emailService.js';
import AuditService from '../services/auditService.js';
import generateUniqueMemberId from '../utils/memberIdGenerator.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/apiResponse.js';
import { syncExpiredMemberships } from '../services/membershipSyncService.js';

// Zod Schemas
export const createMemberSchema = z.object({
  name: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  phone: z.string().min(7, 'Please enter a valid phone number').max(20),
  address: z.string().min(3, 'Address is required'),
  profileImageUrl: z.string().optional().default(''),
  planId: z.string().min(1, 'Membership plan is required'),
  startDate: z.string().optional(),
  dateOfBirth: z.string().optional().nullable(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional().default('PREFER_NOT_TO_SAY'),
  medicalNotes: z.string().optional(),
  additionalNotes: z.string().optional(),
  initialPaymentAmount: z.number().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER']).optional().default('CASH')
});

export const updateMemberSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(7).optional(),
  address: z.string().min(3).optional(),
  profileImageUrl: z.string().optional(),
  dateOfBirth: z.string().optional().nullable(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'EXPIRED']).optional(),
  medicalNotes: z.string().optional(),
  additionalNotes: z.string().optional()
});

export class MemberController {
  /**
   * Create a new gym member (Admin only)
   */
  static async createMember(req, res) {
    try {
      const {
        name,
        email,
        phone,
        address,
        profileImageUrl,
        planId,
        startDate,
        dateOfBirth,
        emergencyContactName,
        emergencyContactPhone,
        gender,
        medicalNotes,
        additionalNotes,
        initialPaymentAmount,
        paymentMethod
      } = req.body;

      // 1. Prevent duplicate email in User accounts
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return errorResponse(res, `An account with email '${email}' already exists.`, 409);
      }

      // 2. Validate Membership Plan
      const plan = await MembershipPlan.findById(planId);
      if (!plan || plan.status !== 'ACTIVE') {
        return errorResponse(res, 'Selected membership plan is invalid or inactive', 400);
      }

      // 3. Generate Unique Member ID (e.g. GYM-2026-0001)
      const memberId = await generateUniqueMemberId();

      // 4. Generate One-Time Credential and Invitation Token
      const oneTimeCredential = TokenService.generateOneTimeCredential();
      const invitationToken = TokenService.generateRandomToken();
      const oneTimeCredentialHash = TokenService.hashToken(oneTimeCredential);
      const invitationTokenHash = TokenService.hashToken(invitationToken);
      const invitationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Generate random strong temporary password hash for security
      const tempPasswordHash = await User.hashPassword(TokenService.generateRandomToken());

      // 5. Create User Record
      const newUser = await User.create({
        name,
        email,
        passwordHash: tempPasswordHash,
        role: 'MEMBER',
        status: 'ACTIVE',
        mustChangePassword: true,
        memberId,
        oneTimeCredentialHash,
        invitationTokenHash,
        invitationExpiresAt
      });

      // 6. Calculate Start and Expiration Dates
      const membershipStartDate = startDate ? new Date(startDate) : new Date();
      const membershipEndDate = new Date(membershipStartDate);
      membershipEndDate.setDate(membershipEndDate.getDate() + plan.durationDays);

      // 7. Create Member Record
      const newMember = await Member.create({
        userId: newUser._id,
        memberId,
        phone,
        address,
        profileImageUrl: profileImageUrl || '',
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        emergencyContact: {
          name: emergencyContactName || '',
          phone: emergencyContactPhone || ''
        },
        gender,
        medicalNotes: medicalNotes || '',
        additionalNotes: additionalNotes || '',
        status: 'ACTIVE',
        invitationStatus: 'PENDING'
      });

      // 8. Create Initial Membership Record
      const membership = await Membership.create({
        memberId,
        memberRef: newMember._id,
        planId: plan._id,
        startDate: membershipStartDate,
        endDate: membershipEndDate,
        status: 'ACTIVE'
      });

      // Link membership to member
      newMember.membershipId = membership._id;
      await newMember.save();

      // 9. Optional Initial Payment Record
      let paymentRecord = null;
      if (initialPaymentAmount && initialPaymentAmount > 0) {
        paymentRecord = await Payment.create({
          memberId,
          memberRef: newMember._id,
          membershipId: membership._id,
          amount: initialPaymentAmount,
          paymentMethod: paymentMethod || 'CASH',
          transactionReference: `TXN-${memberId}-${Date.now()}`,
          paymentDate: new Date(),
          status: 'COMPLETED',
          recordedBy: req.user.id,
          notes: `Initial membership payment for ${plan.name}`
        });
      }

      // 10. Send Invitation Email via Gmail SMTP
      const emailResult = await EmailService.sendMemberInvitation({
        memberName: name,
        email,
        memberId,
        invitationToken,
        oneTimeCredential
      });

      if (emailResult.success) {
        newMember.invitationStatus = 'SENT';
        newMember.lastInvitedAt = new Date();
        await newMember.save();
      } else {
        newMember.invitationStatus = 'FAILED';
        await newMember.save();
      }

      // 11. Audit Log
      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'MEMBER_CREATED',
        targetType: 'MEMBER',
        targetId: newMember._id.toString(),
        details: { memberId, name, email, plan: plan.name, invitationSent: emailResult.success }
      });

      return successResponse(
        res,
        emailResult.success
          ? `Member ${name} (${memberId}) registered successfully and invitation sent!`
          : `Member ${name} (${memberId}) registered. Email failed to deliver; use 'Resend Invitation' to retry.`,
        {
          member: newMember,
          user: {
            id: newUser._id,
            name: newUser.name,
            email: newUser.email,
            memberId: newUser.memberId
          },
          membership,
          payment: paymentRecord,
          invitation: {
            status: newMember.invitationStatus,
            oneTimeCredentialPreview: process.env.NODE_ENV !== 'production' ? oneTimeCredential : undefined
          }
        },
        201
      );
    } catch (error) {
      console.error('[MemberController.createMember]', error);
      return errorResponse(res, error.message || 'Failed to create member', 500);
    }
  }

  /**
   * Get all members with server-side search, filters, sorting, and pagination (Admin only)
   */
  static async getMembers(req, res) {
    try {
      // Sync expired memberships so members with expired plans become INACTIVE
      await syncExpiredMemberships();

      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const search = (req.query.search || '').trim();
      const status = req.query.status;
      const planId = req.query.planId;
      const sortBy = req.query.sortBy || 'createdAt';
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

      // Base query
      const query = {};

      if (status && ['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) {
        query.status = status;
      }

      // If search query is provided
      if (search) {
        // Find matching users first by name or email
        const matchingUsers = await User.find({
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }).select('_id');

        const userIds = matchingUsers.map((u) => u._id);

        query.$or = [
          { memberId: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
          { userId: { $in: userIds } }
        ];
      }

      // Filter by plan if specified
      if (planId && mongoose.isValidObjectId(planId)) {
        const membershipsWithPlan = await Membership.find({
          planId,
          status: 'ACTIVE'
        }).select('memberRef');
        const memberRefIds = membershipsWithPlan.map((m) => m.memberRef);
        query._id = { $in: memberRefIds };
      }

      const total = await Member.countDocuments(query);

      const members = await Member.find(query)
        .populate('userId', 'name email status mustChangePassword lastLoginAt')
        .populate({
          path: 'membershipId',
          populate: { path: 'planId', select: 'name durationDays price' }
        })
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean();

      return paginatedResponse(res, 'Members retrieved successfully', members, {
        total,
        page,
        limit
      });
    } catch (error) {
      console.error('[MemberController.getMembers]', error);
      return errorResponse(res, 'Failed to fetch members', 500);
    }
  }

  /**
   * Get single member details (Admin or Member own profile)
   */
  static async getMemberById(req, res) {
    try {
      await syncExpiredMemberships();

      const { id } = req.params;

      let member = null;
      if (mongoose.isValidObjectId(id)) {
        member = await Member.findById(id);
      }
      if (!member) {
        member = await Member.findOne({ memberId: id.toUpperCase() });
      }

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      // Security: If logged in as MEMBER, ensure they can only view their own profile
      if (req.user.role === 'MEMBER') {
        if (member.userId.toString() !== req.user.id && member.memberId !== req.user.memberId) {
          return errorResponse(res, 'Access denied. You can only view your own member profile.', 403);
        }
      }

      await member.populate('userId', 'name email status mustChangePassword createdAt');
      await member.populate({
        path: 'membershipId',
        populate: { path: 'planId' }
      });

      return successResponse(res, 'Member details retrieved', member);
    } catch (error) {
      console.error('[MemberController.getMemberById]', error);
      return errorResponse(res, 'Failed to retrieve member details', 500);
    }
  }

  /**
   * Update member details (Admin or permitted fields for Member)
   */
  static async updateMember(req, res) {
    try {
      const { id } = req.params;

      let member = await Member.findById(id);
      if (!member) {
        member = await Member.findOne({ memberId: id.toUpperCase() });
      }

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      const isAdmin = req.user.role === 'ADMIN';

      // Security check for members
      if (!isAdmin) {
        if (member.userId.toString() !== req.user.id) {
          return errorResponse(res, 'Access denied. You can only update your own profile.', 403);
        }
      }

      const {
        name,
        email,
        phone,
        address,
        profileImageUrl,
        dateOfBirth,
        emergencyContactName,
        emergencyContactPhone,
        gender,
        status,
        medicalNotes,
        additionalNotes
      } = req.body;

      // Update User details if provided and authorized
      if (name) {
        await User.findByIdAndUpdate(member.userId, { name });
      }

      if (isAdmin && email) {
        const cleanEmail = email.toLowerCase().trim();
        const existing = await User.findOne({ email: cleanEmail, _id: { $ne: member.userId } });
        if (existing) {
          return errorResponse(res, `Email '${cleanEmail}' is already used by another account.`, 409);
        }
        await User.findByIdAndUpdate(member.userId, { email: cleanEmail });
      }

      if (phone) member.phone = phone;
      if (address) member.address = address;
      if (profileImageUrl !== undefined) member.profileImageUrl = profileImageUrl;
      if (dateOfBirth !== undefined) member.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : undefined;
      if (emergencyContactName !== undefined || emergencyContactPhone !== undefined) {
        member.emergencyContact = {
          name: emergencyContactName !== undefined ? emergencyContactName : member.emergencyContact?.name,
          phone: emergencyContactPhone !== undefined ? emergencyContactPhone : member.emergencyContact?.phone
        };
      }
      if (gender) member.gender = gender;

      // Update status if passed by admin
      if (isAdmin && status && ['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) {
        member.status = status;
        await User.findByIdAndUpdate(member.userId, {
          status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
        });
      }

      // Only staff/admins may update internal medical and additional notes
      if (isAdmin) {
        if (medicalNotes !== undefined) member.medicalNotes = medicalNotes;
        if (additionalNotes !== undefined) member.additionalNotes = additionalNotes;
      }

      await member.save();
      await member.populate('userId', 'name email status');
      await member.populate({
        path: 'membershipId',
        populate: { path: 'planId' }
      });

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'MEMBER_UPDATED',
        targetType: 'MEMBER',
        targetId: member._id.toString(),
        details: { updatedBy: req.user.role, memberId: member.memberId }
      });

      return successResponse(res, 'Member updated successfully', member);
    } catch (error) {
      console.error('[MemberController.updateMember]', error);
      return errorResponse(res, 'Failed to update member', 500);
    }
  }

  /**
   * Toggle member active / inactive status (Admin only)
   */
  static async toggleMemberStatus(req, res) {
    try {
      const { id } = req.params;
      let member = await Member.findById(id);
      if (!member) {
        member = await Member.findOne({ memberId: id.toUpperCase() });
      }

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      const explicitStatus = req.body?.status;
      const newStatus = explicitStatus && ['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(explicitStatus)
        ? explicitStatus
        : member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

      member.status = newStatus;
      await member.save();

      // Synchronize User status
      if (member.userId) {
        await User.findByIdAndUpdate(member.userId, {
          status: newStatus === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE'
        });
      }

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: newStatus === 'ACTIVE' ? 'MEMBER_ACTIVATED' : 'MEMBER_DEACTIVATED',
        targetType: 'MEMBER',
        targetId: member._id.toString(),
        details: { memberId: member.memberId, newStatus }
      });

      return successResponse(res, `Member marked as ${newStatus}`, { status: newStatus });
    } catch (error) {
      console.error('[MemberController.toggleMemberStatus]', error);
      return errorResponse(res, 'Failed to change member status', 500);
    }
  }

  /**
   * Resend member invitation email (Admin only, idempotent)
   */
  static async resendInvitation(req, res) {
    try {
      const { id } = req.params;
      const member = await Member.findById(id).populate('userId');

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      const user = await User.findById(member.userId._id).select(
        '+oneTimeCredentialHash +invitationExpiresAt'
      );

      if (!user) {
        return errorResponse(res, 'Associated user account not found', 404);
      }

      // Generate fresh one-time credential and token (24-hour expiration)
      const oneTimeCredential = TokenService.generateOneTimeCredential();
      const invitationToken = TokenService.generateRandomToken();
      user.oneTimeCredentialHash = TokenService.hashToken(oneTimeCredential);
      user.invitationTokenHash = TokenService.hashToken(invitationToken);
      user.invitationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      user.mustChangePassword = true;
      await user.save();

      // Dispatch invitation email via Gmail SMTP
      const emailResult = await EmailService.sendMemberInvitation({
        memberName: user.name,
        email: user.email,
        memberId: member.memberId,
        invitationToken,
        oneTimeCredential
      });

      if (emailResult.success) {
        member.invitationStatus = 'SENT';
        member.lastInvitedAt = new Date();
      } else {
        member.invitationStatus = 'FAILED';
      }
      await member.save();

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'INVITATION_RESENT',
        targetType: 'MEMBER',
        targetId: member._id.toString(),
        details: { memberId: member.memberId, email: user.email, success: emailResult.success }
      });

      if (!emailResult.success) {
        return successResponse(
          res,
          `New login credentials generated for ${user.name}. Note: Email delivery could not be completed (${emailResult.error}). Please verify your GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env.`,
          {
            invitationStatus: member.invitationStatus,
            oneTimeCredentialPreview: oneTimeCredential,
            emailDeliveryFailed: true,
            emailError: emailResult.error
          }
        );
      }

      return successResponse(res, `Invitation successfully resent to ${user.email}`, {
        invitationStatus: member.invitationStatus,
        oneTimeCredentialPreview: oneTimeCredential
      });
    } catch (error) {
      console.error('[MemberController.resendInvitation]', error);
      return errorResponse(res, 'Failed to resend invitation', 500);
    }
  }

  /**
   * Get member's membership history
   */
  static async getMemberMemberships(req, res) {
    try {
      const { id } = req.params;
      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { memberId: id.toUpperCase() }
        ]
      });

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      if (req.user.role === 'MEMBER' && member.userId.toString() !== req.user.id) {
        return errorResponse(res, 'Access denied', 403);
      }

      const memberships = await Membership.find({ memberRef: member._id })
        .populate('planId')
        .sort({ startDate: -1 });

      return successResponse(res, 'Memberships retrieved', memberships);
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve memberships', 500);
    }
  }

  /**
   * Get member's payment history
   */
  static async getMemberPayments(req, res) {
    try {
      const { id } = req.params;
      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { memberId: id.toUpperCase() }
        ]
      });

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      if (req.user.role === 'MEMBER' && member.userId.toString() !== req.user.id) {
        return errorResponse(res, 'Access denied', 403);
      }

      const payments = await Payment.find({ memberRef: member._id })
        .populate({
          path: 'membershipId',
          populate: { path: 'planId' }
        })
        .sort({ paymentDate: -1 });

      return successResponse(res, 'Payments retrieved', payments);
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve payments', 500);
    }
  }

  /**
   * Get member's attendance history
   */
  static async getMemberAttendance(req, res) {
    try {
      const { id } = req.params;
      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(id) ? [{ _id: id }] : []),
          { memberId: id.toUpperCase() }
        ]
      });

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      if (req.user.role === 'MEMBER' && member.userId.toString() !== req.user.id) {
        return errorResponse(res, 'Access denied', 403);
      }

      const attendance = await Attendance.find({ memberRef: member._id })
        .sort({ checkInAt: -1 })
        .limit(100);

      return successResponse(res, 'Attendance retrieved', attendance);
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve attendance', 500);
    }
  }
}

export default MemberController;
