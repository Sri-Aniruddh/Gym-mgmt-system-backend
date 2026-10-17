import { transporter, isMailConfigured } from '../config/mailer.js';
import GymSettings from '../models/GymSettings.js';
import {
  invitationEmailTemplate,
  passwordResetEmailTemplate,
  paymentReceiptEmailTemplate,
  membershipRenewalReminderEmailTemplate,
  membershipExpiredEmailTemplate
} from '../templates/emailTemplates.js';

class EmailService {
  /**
   * Internal sender method using Nodemailer with Gmail SMTP
   */
  static async sendMail({ to, subject, html, text }) {
    const fromAddress =
      process.env.EMAIL_FROM ||
      (process.env.GMAIL_USER ? `Gym Management <${process.env.GMAIL_USER}>` : 'Gym Management');

    // If Gmail credentials are not configured
    if (!isMailConfigured) {
      console.warn('\n======================================================');
      console.warn('[EmailService DEV] Gmail SMTP is not configured.');
      console.warn('Set GMAIL_USER and GMAIL_APP_PASSWORD in backend/.env to send live emails.');
      console.warn(`Simulated Email To: ${to}`);
      console.warn(`Subject: ${subject}`);
      console.warn('======================================================\n');
      return {
        success: false,
        error: 'Gmail SMTP credentials are not configured in backend/.env. Please set GMAIL_USER and GMAIL_APP_PASSWORD.'
      };
    }

    try {
      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
        text: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '')
      });

      console.log(`[EmailService] Email sent successfully to ${to} (Message ID: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      // Log clean backend error without exposing passwords or credentials
      console.error(`[EmailService] Gmail SMTP error sending to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send Member Invitation Email containing personal password setup link
   */
  static async sendMemberInvitation({ memberName, email, memberId, invitationToken, oneTimeCredential }) {
    const settings = await GymSettings.getSettings();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const setupUrl = `${frontendUrl}/setup-password?token=${invitationToken}`;
    const loginUrl = `${frontendUrl}/login`;

    const { subject, html } = invitationEmailTemplate({
      memberName,
      email,
      memberId,
      setupUrl,
      loginUrl,
      oneTimeCredential,
      gymName: settings.gymName
    });

    return await this.sendMail({ to: email, subject, html });
  }

  /**
   * Send Password Reset Email
   */
  static async sendPasswordReset({ memberName, email, resetToken }) {
    const settings = await GymSettings.getSettings();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    const { subject, html } = passwordResetEmailTemplate({
      memberName,
      resetUrl,
      expiresInMinutes: 30,
      gymName: settings.gymName
    });

    return await this.sendMail({ to: email, subject, html });
  }

  /**
   * Send Payment Receipt Email
   */
  static async sendPaymentReceipt({
    memberName,
    email,
    memberId,
    amount,
    paymentMethod,
    transactionReference,
    paymentDate,
    planName
  }) {
    const settings = await GymSettings.getSettings();

    const { subject, html } = paymentReceiptEmailTemplate({
      memberName,
      memberId,
      amount,
      currencySymbol: settings.currencySymbol || '₹',
      paymentMethod,
      transactionReference,
      paymentDate,
      planName,
      gymName: settings.gymName
    });

    return await this.sendMail({ to: email, subject, html });
  }

  /**
   * Send Membership Renewal Reminder
   */
  static async sendRenewalReminder({ memberName, email, planName, expirationDate }) {
    const settings = await GymSettings.getSettings();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const { subject, html } = membershipRenewalReminderEmailTemplate({
      memberName,
      planName,
      expirationDate,
      portalUrl: `${frontendUrl}/member`,
      gymName: settings.gymName
    });

    return await this.sendMail({ to: email, subject, html });
  }

  /**
   * Send Membership Expired Notification
   */
  static async sendExpiredNotification({ memberName, email, planName }) {
    const settings = await GymSettings.getSettings();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const { subject, html } = membershipExpiredEmailTemplate({
      memberName,
      planName,
      portalUrl: `${frontendUrl}/member`,
      gymName: settings.gymName
    });

    return await this.sendMail({ to: email, subject, html });
  }
}

export default EmailService;
