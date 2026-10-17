import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema(
  {
    memberId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    memberRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
      required: true,
      index: true
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembershipPlan',
      required: true
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    endDate: {
      type: Date,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
      default: 'ACTIVE',
      index: true
    },
    autoRenew: {
      type: Boolean,
      default: false
    },
    notes: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

// Compound index for active memberships expiration queries
membershipSchema.index({ status: 1, endDate: 1 });

const Membership = mongoose.model('Membership', membershipSchema);
export default Membership;
