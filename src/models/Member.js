import mongoose from 'mongoose';

const memberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    memberId: {
      type: String,
      required: [true, 'Member ID is required'],
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      index: true
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    profileImageUrl: {
      type: String,
      default: ''
    },
    dateOfBirth: {
      type: Date
    },
    emergencyContact: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true }
    },
    gender: {
      type: String,
      enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'],
      default: 'PREFER_NOT_TO_SAY'
    },
    medicalNotes: {
      type: String,
      trim: true
    },
    additionalNotes: {
      type: String,
      trim: true
    },
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership'
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'],
      default: 'ACTIVE',
      index: true
    },
    invitationStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'ACCEPTED', 'FAILED'],
      default: 'PENDING',
      index: true
    },
    lastInvitedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

// Compound text index for fast search by memberId, phone, and populated user name
memberSchema.index({ memberId: 'text', phone: 'text' });

const Member = mongoose.model('Member', memberSchema);
export default Member;
