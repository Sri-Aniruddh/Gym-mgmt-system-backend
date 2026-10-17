import Member from '../models/Member.js';
import Membership from '../models/Membership.js';
import Payment from '../models/Payment.js';
import Attendance from '../models/Attendance.js';
import AuditLog from '../models/AuditLog.js';
import { successResponse, errorResponse, paginatedResponse } from '../utils/apiResponse.js';

export class ReportController {
  /**
   * Comprehensive Gym Performance Report
   */
  static async getSummaryReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const dateFilter = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      // Payments in date range
      const paymentMatch = { status: 'COMPLETED' };
      if (startDate || endDate) paymentMatch.paymentDate = dateFilter;

      const paymentsAgg = await Payment.aggregate([
        { $match: paymentMatch },
        {
          $group: {
            _id: '$paymentMethod',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      const totalRevenue = paymentsAgg.reduce((acc, curr) => acc + curr.totalAmount, 0);
      const totalTransactions = paymentsAgg.reduce((acc, curr) => acc + curr.count, 0);

      // Members joined in range
      const memberMatch = {};
      if (startDate || endDate) memberMatch.createdAt = dateFilter;
      const newMembersCount = await Member.countDocuments(memberMatch);

      // Attendance check-ins in range
      const attendanceMatch = {};
      if (startDate || endDate) attendanceMatch.checkInAt = dateFilter;
      const totalCheckIns = await Attendance.countDocuments(attendanceMatch);

      // Membership statuses breakdown
      const [activeMemberships, expiredMemberships, cancelledMemberships] = await Promise.all([
        Membership.countDocuments({ status: 'ACTIVE' }),
        Membership.countDocuments({ status: 'EXPIRED' }),
        Membership.countDocuments({ status: 'CANCELLED' })
      ]);

      return successResponse(res, 'Summary report generated', {
        revenue: {
          totalRevenue,
          totalTransactions,
          byMethod: paymentsAgg
        },
        members: {
          newMembersCount,
          activeMemberships,
          expiredMemberships,
          cancelledMemberships
        },
        attendance: {
          totalCheckIns
        }
      });
    } catch (error) {
      console.error('[ReportController.getSummaryReport]', error);
      return errorResponse(res, 'Failed to generate report', 500);
    }
  }

  /**
   * Audit Trail Logs (Admin only)
   */
  static async getAuditLogs(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;
      const skip = (page - 1) * limit;

      const action = req.query.action;
      const targetType = req.query.targetType;

      const query = {};
      if (action) query.action = action;
      if (targetType) query.targetType = targetType;

      const total = await AuditLog.countDocuments(query);
      const logs = await AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      return paginatedResponse(res, 'Audit logs retrieved', logs, {
        total,
        page,
        limit
      });
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve audit logs', 500);
    }
  }
}

export default ReportController;
