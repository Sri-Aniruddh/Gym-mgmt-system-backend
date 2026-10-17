import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    actorName: {
      type: String,
      trim: true
    },
    actorEmail: {
      type: String,
      trim: true
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      required: true,
      enum: ['MEMBER', 'MEMBERSHIP_PLAN', 'MEMBERSHIP', 'PAYMENT', 'ATTENDANCE', 'USER', 'SETTINGS', 'AUTH'],
      index: true
    },
    targetId: {
      type: String,
      index: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false
  }
);

auditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
