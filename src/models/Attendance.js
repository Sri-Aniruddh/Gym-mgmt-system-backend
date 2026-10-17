import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema(
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
    checkInAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    checkOutAt: {
      type: Date
    },
    dateString: {
      type: String, // Format: YYYY-MM-DD in local/UTC date
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PRESENT', 'CHECKED_OUT'],
      default: 'PRESENT',
      index: true
    },
    markedBy: {
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

// Compound index to quickly find check-ins on a specific date for a member
attendanceSchema.index({ memberId: 1, dateString: 1 });
attendanceSchema.index({ checkInAt: -1 });

const Attendance = mongoose.model('Attendance', attendanceSchema);
export default Attendance;
