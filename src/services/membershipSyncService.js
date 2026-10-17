import Membership from '../models/Membership.js';
import Member from '../models/Member.js';
import User from '../models/User.js';

/**
 * Service to automatically detect expired memberships and transition member statuses to INACTIVE.
 */
export async function syncExpiredMemberships() {
  try {
    const now = new Date();

    // 1. Find all memberships currently marked ACTIVE that have passed their endDate
    const expiredMemberships = await Membership.find({
      status: 'ACTIVE',
      endDate: { $lt: now }
    });

    if (expiredMemberships.length === 0) {
      return { expiredCount: 0, membersDeactivated: 0 };
    }

    const expiredIds = expiredMemberships.map((m) => m._id);
    await Membership.updateMany(
      { _id: { $in: expiredIds } },
      { $set: { status: 'EXPIRED' } }
    );

    // 2. Identify unique members whose active plan expired
    const memberRefIds = [...new Set(expiredMemberships.map((m) => m.memberRef.toString()))];
    let membersDeactivated = 0;

    for (const memberRefId of memberRefIds) {
      // Check if this member has ANY other currently valid active membership
      const validActiveMembership = await Membership.findOne({
        memberRef: memberRefId,
        status: 'ACTIVE',
        endDate: { $gte: now }
      }).sort({ endDate: -1 });

      if (!validActiveMembership) {
        // No remaining active memberships -> update Member and User to INACTIVE
        const member = await Member.findByIdAndUpdate(
          memberRefId,
          { status: 'INACTIVE' },
          { new: true }
        );
        if (member?.userId) {
          await User.findByIdAndUpdate(member.userId, { status: 'INACTIVE' });
        }
        membersDeactivated++;
      } else {
        // Update member pointer to the currently valid membership
        await Member.findByIdAndUpdate(memberRefId, {
          membershipId: validActiveMembership._id,
          status: 'ACTIVE'
        });
      }
    }

    console.log(
      `[MembershipSync] Processed ${expiredMemberships.length} expired memberships. Set ${membersDeactivated} members to INACTIVE.`
    );

    return { expiredCount: expiredMemberships.length, membersDeactivated };
  } catch (error) {
    console.error('[MembershipSync] Error executing syncExpiredMemberships:', error.message);
    return { error: error.message };
  }
}

export default { syncExpiredMemberships };
