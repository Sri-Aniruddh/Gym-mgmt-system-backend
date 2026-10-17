import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    memberId: {
      type: String,
      required: [true, 'Member ID is required'],
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
    membershipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Membership'
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Amount cannot be negative']
    },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER'],
      default: 'CASH',
      index: true
    },
    transactionReference: {
      type: String,
      required: [true, 'Transaction reference is required'],
      unique: true,
      trim: true,
      index: true
    },
    paymentDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'PENDING', 'FAILED', 'REFUNDED'],
      default: 'COMPLETED',
      index: true
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
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

// Compound index for member payments timeline
paymentSchema.index({ memberId: 1, paymentDate: -1 });

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
