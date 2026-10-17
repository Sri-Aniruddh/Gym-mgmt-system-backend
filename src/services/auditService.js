import AuditLog from '../models/AuditLog.js';

export class AuditService {
  /**
   * Log an administrative or security action
   */
  static async logAction({
    req,
    actorUser,
    action,
    targetType,
    targetId = null,
    details = {}
  }) {
    try {
      const actorUserId = actorUser?._id || actorUser?.id || req?.user?.id;
      const actorName = actorUser?.name || req?.user?.name || 'System';
      const actorEmail = actorUser?.email || req?.user?.email || 'system@app.local';
      const ipAddress = req?.headers['x-forwarded-for'] || req?.socket?.remoteAddress || '127.0.0.1';

      await AuditLog.create({
        actorUserId,
        actorName,
        actorEmail,
        action,
        targetType,
        targetId: targetId ? targetId.toString() : null,
        details,
        ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress.split(',')[0].trim()
      });
    } catch (err) {
      // Never crash a primary request if audit logging encounters an issue
      console.error('[AuditService] Failed to record audit log:', err.message);
    }
  }
}

export default AuditService;
