import Member from '../models/Member.js';

/**
 * Generate a sequential, unique Member ID in format GYM-YYYY-XXXX (e.g., GYM-2026-0001)
 */
export const generateUniqueMemberId = async () => {
  const currentYear = new Date().getFullYear();
  const prefix = `GYM-${currentYear}-`;

  // Find the highest existing memberId for the current year
  const latestMember = await Member.findOne({
    memberId: { $regex: `^${prefix}` }
  })
    .sort({ memberId: -1 })
    .select('memberId')
    .lean();

  let nextSequenceNumber = 1;
  if (latestMember && latestMember.memberId) {
    const parts = latestMember.memberId.split('-');
    if (parts.length === 3) {
      const parsed = parseInt(parts[2], 10);
      if (!isNaN(parsed)) {
        nextSequenceNumber = parsed + 1;
      }
    }
  }

  // Format with 4 digits padding (e.g., 0001)
  let candidateId = `${prefix}${String(nextSequenceNumber).padStart(4, '0')}`;

  // Ensure collision-free
  let collision = await Member.exists({ memberId: candidateId });
  while (collision) {
    nextSequenceNumber++;
    candidateId = `${prefix}${String(nextSequenceNumber).padStart(4, '0')}`;
    collision = await Member.exists({ memberId: candidateId });
  }

  return candidateId;
};

export default generateUniqueMemberId;
