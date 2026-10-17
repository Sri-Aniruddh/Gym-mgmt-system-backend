import { z } from 'zod';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Member from '../models/Member.js';
import User from '../models/User.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/apiResponse.js';
import { syncExpiredMemberships } from '../services/membershipSyncService.js';

export const checkInSchema = z.object({
  memberId: z.string().min(1, 'Member ID is required'),
  checkInAt: z.string().optional(),
  notes: z.string().optional()
});

export const checkOutSchema = z.object({
  attendanceId: z.string().min(1, 'Attendance ID is required'),
  checkOutAt: z.string().optional()
});

export const selfCheckInSchema = z.object({
  identifier: z.string().min(1, 'Member ID or Email is required').trim(),
  verification: z.string().min(1, 'Phone number or password is required').trim(),
  notes: z.string().optional()
});

export class AttendanceController {
  /**
   * Mark Member Check-In
   */
  static async checkIn(req, res) {
    try {
      await syncExpiredMemberships();
      const { memberId, checkInAt, notes } = req.body;

      const member = await Member.findOne({
        $or: [
          ...(mongoose.isValidObjectId(memberId) ? [{ _id: memberId }] : []),
          { memberId: memberId.toUpperCase() }
        ]
      }).populate('userId', 'name');

      if (!member) {
        return errorResponse(res, 'Member not found', 404);
      }

      if (member.status !== 'ACTIVE') {
        return errorResponse(res, `Cannot check in. Member status is currently '${member.status}'.`, 400);
      }

      const checkInDate = checkInAt ? new Date(checkInAt) : new Date();
      // Format YYYY-MM-DD
      const dateString = checkInDate.toISOString().split('T')[0];

      // Prevent accidental duplicate check-in on the exact same date within 4 hours
      const fourHoursAgo = new Date(checkInDate.getTime() - 4 * 60 * 60 * 1000);
      const recentCheckIn = await Attendance.findOne({
        memberRef: member._id,
        checkInAt: { $gte: fourHoursAgo }
      });

      if (recentCheckIn) {
        return errorResponse(
          res,
          `Member ${member.memberId} is already checked in today at ${recentCheckIn.checkInAt.toLocaleTimeString()}. Duplicate check-in prevented.`,
          409
        );
      }

      const attendance = await Attendance.create({
        memberId: member.memberId,
        memberRef: member._id,
        checkInAt: checkInDate,
        dateString,
        status: 'PRESENT',
        markedBy: req.user.id,
        notes: notes || ''
      });

      await AuditService.logAction({
        req,
        actorUser: req.user,
        action: 'ATTENDANCE_CHECKIN',
        targetType: 'ATTENDANCE',
        targetId: attendance._id.toString(),
        details: { memberId: member.memberId, date: dateString }
      });

      return successResponse(res, `Check-in recorded for ${member.userId?.name || member.memberId}`, attendance, 201);
    } catch (error) {
      console.error('[AttendanceController.checkIn]', error);
      return errorResponse(res, 'Failed to record check-in', 500);
    }
  }

  /**
   * Mark Member Check-Out
   */
  static async checkOut(req, res) {
    try {
      const { attendanceId, checkOutAt } = req.body;

      const attendance = await Attendance.findById(attendanceId);
      if (!attendance) {
        return errorResponse(res, 'Attendance record not found', 404);
      }

      attendance.checkOutAt = checkOutAt ? new Date(checkOutAt) : new Date();
      attendance.status = 'CHECKED_OUT';
      await attendance.save();

      return successResponse(res, 'Check-out recorded successfully', attendance);
    } catch (error) {
      return errorResponse(res, 'Failed to record check-out', 500);
    }
  }

  /**
   * Get attendance records with filters and pagination
   */
  static async getAttendance(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 15;
      const skip = (page - 1) * limit;

      const date = req.query.date; // YYYY-MM-DD
      const memberId = req.query.memberId;
      const search = (req.query.search || '').trim();

      const query = {};

      if (req.user.role === 'MEMBER') {
        query.memberId = req.user.memberId;
      } else if (memberId) {
        query.memberId = memberId.toUpperCase();
      }

      if (date) {
        query.dateString = date;
      }

      if (search) {
        query.memberId = { $regex: search, $options: 'i' };
      }

      const total = await Attendance.countDocuments(query);

      const records = await Attendance.find(query)
        .populate({
          path: 'memberRef',
          select: 'phone profileImageUrl',
          populate: { path: 'userId', select: 'name email' }
        })
        .populate('markedBy', 'name')
        .sort({ checkInAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return paginatedResponse(res, 'Attendance records retrieved', records, {
        total,
        page,
        limit
      });
    } catch (error) {
      console.error('[AttendanceController.getAttendance]', error);
      return errorResponse(res, 'Failed to retrieve attendance records', 500);
    }
  }

  /**
   * Get today's attendance summary and active check-ins
   */
  static async getTodaySummary(req, res) {
    try {
      const todayStr = new Date().toISOString().split('T')[0];

      const todayRecords = await Attendance.find({ dateString: todayStr })
        .populate({
          path: 'memberRef',
          select: 'phone profileImageUrl',
          populate: { path: 'userId', select: 'name' }
        })
        .sort({ checkInAt: -1 })
        .lean();

      const presentCount = todayRecords.filter((r) => r.status === 'PRESENT').length;
      const checkedOutCount = todayRecords.filter((r) => r.status === 'CHECKED_OUT').length;

      return successResponse(res, "Today's attendance summary", {
        date: todayStr,
        totalCheckIns: todayRecords.length,
        currentlyInGym: presentCount,
        checkedOut: checkedOutCount,
        records: todayRecords
      });
    } catch (error) {
      return errorResponse(res, 'Failed to fetch today summary', 500);
    }
  }

  /**
   * Public Self Check-In by Member (via Facility Generic QR Code)
   */
  static async selfCheckIn(req, res) {
    try {
      await syncExpiredMemberships();
      const { identifier, verification, notes } = req.body;
      const cleanIdentifier = identifier.trim();
      const isEmail = cleanIdentifier.includes('@');

      let user = null;
      let member = null;

      if (isEmail) {
        user = await User.findOne({ email: cleanIdentifier.toLowerCase() }).select('+passwordHash');
        if (user) {
          member = await Member.findOne({ userId: user._id });
        }
      } else {
        member = await Member.findOne({ memberId: cleanIdentifier.toUpperCase() });
        if (member) {
          user = await User.findById(member.userId).select('+passwordHash');
        }
      }

      if (!member || !user) {
        return errorResponse(res, 'No active member found matching this Member ID or Email', 404);
      }

      // Check Verification: either phone matches, or password matches
      const cleanVerificationPhone = verification.replace(/\D/g, '');
      const cleanMemberPhone = (member.phone || '').replace(/\D/g, '');
      const isPhoneMatch =
        cleanVerificationPhone.length >= 4 &&
        (cleanMemberPhone.endsWith(cleanVerificationPhone) || cleanVerificationPhone.endsWith(cleanMemberPhone));

      let isPasswordMatch = false;
      if (!isPhoneMatch && user.passwordHash) {
        isPasswordMatch = await user.comparePassword(verification);
      }

      if (!isPhoneMatch && !isPasswordMatch) {
        return errorResponse(
          res,
          'Verification failed. Please check your registered phone number or password.',
          401
        );
      }

      if (member.status !== 'ACTIVE') {
        return errorResponse(
          res,
          `Cannot check in. Your membership status is currently '${member.status}'. Please see the front desk.`,
          403
        );
      }

      const checkInDate = new Date();
      const dateString = checkInDate.toISOString().split('T')[0];

      // Prevent duplicate check-in on the same day within 4 hours
      const fourHoursAgo = new Date(checkInDate.getTime() - 4 * 60 * 60 * 1000);
      const recentCheckIn = await Attendance.findOne({
        memberRef: member._id,
        checkInAt: { $gte: fourHoursAgo }
      });

      if (recentCheckIn) {
        return errorResponse(
          res,
          `You are already checked in today at ${recentCheckIn.checkInAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Enjoy your workout!`,
          409
        );
      }

      const attendance = await Attendance.create({
        memberId: member.memberId,
        memberRef: member._id,
        checkInAt: checkInDate,
        dateString,
        status: 'PRESENT',
        notes: notes || 'Self check-in via facility QR code'
      });

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'ATTENDANCE_SELF_CHECKIN',
        targetType: 'ATTENDANCE',
        targetId: attendance._id.toString(),
        details: { memberId: member.memberId, method: isPhoneMatch ? 'PHONE' : 'PASSWORD' }
      });

      return successResponse(
        res,
        `Welcome to the gym, ${user.name}! Your workout check-in is confirmed.`,
        {
          attendance,
          member: {
            memberId: member.memberId,
            name: user.name,
            checkInAt: attendance.checkInAt
          }
        },
        201
      );
    } catch (error) {
      console.error('[AttendanceController.selfCheckIn]', error);
      return errorResponse(res, 'Failed to complete self check-in', 500);
    }
  }
}

export default AttendanceController;
