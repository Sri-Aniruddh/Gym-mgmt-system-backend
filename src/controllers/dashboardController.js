import Member from '../models/Member.js';
import Membership from '../models/Membership.js';
import MembershipPlan from '../models/MembershipPlan.js';
import Payment from '../models/Payment.js';
import Attendance from '../models/Attendance.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

export class DashboardController {
  /**
   * Admin KPI metrics, aggregation charts, and recent activity
   */
  static async getAdminDashboard(req, res) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // 1. Core KPIs from real MongoDB documents
      const [
        totalMembers,
        activeMembers,
        newMembersThisMonth,
        expiringSoonCount,
        expiredCount,
        revenueAgg
      ] = await Promise.all([
        Member.countDocuments(),
        Member.countDocuments({ status: 'ACTIVE' }),
        Member.countDocuments({ createdAt: { $gte: startOfMonth } }),
        Membership.countDocuments({
          status: 'ACTIVE',
          endDate: { $gte: now, $lte: sevenDaysFromNow }
        }),
        Membership.countDocuments({
          $or: [
            { status: 'EXPIRED' },
            { endDate: { $lt: now } }
          ]
        }),
        Payment.aggregate([
          { $match: { status: 'COMPLETED' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      const totalRevenueCollected = revenueAgg[0]?.total || 0;

      // 2. Monthly Revenue aggregation for the last 6 months
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const monthlyRevenueAgg = await Payment.aggregate([
        {
          $match: {
            status: 'COMPLETED',
            paymentDate: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$paymentDate' },
              month: { $month: '$paymentDate' }
            },
            revenue: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyRevenue = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const found = monthlyRevenueAgg.find((r) => r._id.year === y && r._id.month === m);
        monthlyRevenue.push({
          month: `${monthNames[m - 1]} ${y}`,
          revenue: found ? found.revenue : 0,
          count: found ? found.count : 0
        });
      }

      // 3. Member Registration Trends for last 6 months
      const monthlyRegAgg = await Member.aggregate([
        {
          $match: {
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            registrations: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]);

      const registrationTrends = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const found = monthlyRegAgg.find((r) => r._id.year === y && r._id.month === m);
        registrationTrends.push({
          month: `${monthNames[m - 1]} ${y}`,
          registrations: found ? found.registrations : 0
        });
      }

      // 4. Membership Plan Distribution
      const planDistributionAgg = await Membership.aggregate([
        { $match: { status: 'ACTIVE' } },
        {
          $group: {
            _id: '$planId',
            count: { $sum: 1 }
          }
        }
      ]);

      const plans = await MembershipPlan.find().select('name');
      const planMap = new Map(plans.map((p) => [p._id.toString(), p.name]));

      const planDistribution = planDistributionAgg.map((item) => ({
        name: planMap.get(item._id.toString()) || 'Custom Plan',
        value: item.count
      }));

      // 5. Recent Activity
      const [recentMembers, recentPayments] = await Promise.all([
        Member.find()
          .populate('userId', 'name email')
          .populate({ path: 'membershipId', populate: { path: 'planId', select: 'name' } })
          .sort({ createdAt: -1 })
          .limit(5)
          .lean(),
        Payment.find()
          .populate({ path: 'memberRef', populate: { path: 'userId', select: 'name' } })
          .sort({ paymentDate: -1 })
          .limit(5)
          .lean()
      ]);

      return successResponse(res, 'Admin dashboard analytics retrieved', {
        kpis: {
          totalMembers,
          activeMembers,
          expiredMemberships: expiredCount,
          membershipsExpiringSoon: expiringSoonCount,
          newMembersThisMonth,
          totalRevenueCollected
        },
        charts: {
          monthlyRevenue,
          registrationTrends,
          planDistribution
        },
        recentActivity: {
          members: recentMembers,
          payments: recentPayments
        }
      });
    } catch (error) {
      console.error('[DashboardController.getAdminDashboard]', error);
      return errorResponse(res, 'Failed to fetch admin dashboard analytics', 500);
    }
  }

  /**
   * Member personalized dashboard (Role: MEMBER)
   */
  static async getMemberDashboard(req, res) {
    try {
      const member = await Member.findOne({ userId: req.user.id })
        .populate('userId', 'name email')
        .populate({
          path: 'membershipId',
          populate: { path: 'planId' }
        });

      if (!member) {
        return errorResponse(res, 'Member profile record not found', 404);
      }

      // Fetch recent attendance
      const recentAttendance = await Attendance.find({ memberRef: member._id })
        .sort({ checkInAt: -1 })
        .limit(7)
        .lean();

      // Fetch recent payments
      const recentPayments = await Payment.find({ memberRef: member._id })
        .populate({ path: 'membershipId', populate: { path: 'planId', select: 'name' } })
        .sort({ paymentDate: -1 })
        .limit(5)
        .lean();

      // Calculate days remaining in membership
      let daysRemaining = 0;
      let isExpiringSoon = false;
      const now = new Date();

      if (member.membershipId?.endDate) {
        const diffTime = new Date(member.membershipId.endDate).getTime() - now.getTime();
        daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
        isExpiringSoon = daysRemaining > 0 && daysRemaining <= 7;
      }

      // Attendance stats (this month)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const totalVisitsThisMonth = await Attendance.countDocuments({
        memberRef: member._id,
        checkInAt: { $gte: startOfMonth }
      });

      return successResponse(res, 'Member dashboard retrieved', {
        welcomeMessage: `Welcome back, ${member.userId.name}!`,
        member: {
          id: member._id,
          memberId: member.memberId,
          name: member.userId.name,
          email: member.userId.email,
          phone: member.phone,
          address: member.address,
          profileImageUrl: member.profileImageUrl,
          emergencyContact: member.emergencyContact,
          gender: member.gender,
          status: member.status
        },
        membership: member.membershipId
          ? {
              id: member.membershipId._id,
              planName: member.membershipId.planId?.name || 'Standard Plan',
              startDate: member.membershipId.startDate,
              endDate: member.membershipId.endDate,
              status: member.membershipId.status,
              daysRemaining,
              isExpiringSoon
            }
          : null,
        stats: {
          visitsThisMonth: totalVisitsThisMonth,
          totalVisitsAllTime: await Attendance.countDocuments({ memberRef: member._id })
        },
        recentAttendance,
        recentPayments
      });
    } catch (error) {
      console.error('[DashboardController.getMemberDashboard]', error);
      return errorResponse(res, 'Failed to fetch member dashboard', 500);
    }
  }
}

export default DashboardController;
