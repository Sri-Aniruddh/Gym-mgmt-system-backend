/**
 * Clean, modern branded HTML email templates for Gym Management System
 */

const baseEmailLayout = ({ title, preheader, content, gymName = 'IronPulse Fitness' }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; margin: 0; padding: 24px; color: #f8fafc; }
    .container { max-width: 600px; margin: 0 auto; background: #1e293b; border-radius: 16px; overflow: hidden; border: 1px solid #334155; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%); padding: 32px 24px; text-align: center; }
    .logo-text { font-size: 26px; font-weight: 800; letter-spacing: -0.5px; color: #ffffff; margin: 0; text-transform: uppercase; }
    .content { padding: 32px 24px; color: #cbd5e1; line-height: 1.6; font-size: 15px; }
    .btn { display: inline-block; background: #6366f1; color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-weight: 600; border-radius: 8px; margin: 20px 0; text-align: center; }
    .credential-box { background: #0f172a; border: 1px dashed #6366f1; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .code { font-family: monospace; font-size: 20px; font-weight: 700; color: #38bdf8; letter-spacing: 2px; }
    .footer { background: #0f172a; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #334155; }
    .table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
    .table th { color: #94a3b8; font-weight: 500; }
    .table td { color: #f1f5f9; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>
  <div class="container">
    <div class="header">
      <h1 class="logo-text">${gymName}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${gymName}. All rights reserved.</p>
      <p>This is an automated system email. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;

export const invitationEmailTemplate = ({
  memberName,
  email,
  memberId,
  setupUrl,
  loginUrl,
  oneTimeCredential,
  gymName = 'IronPulse Fitness'
}) => {
  const targetUrl = setupUrl || loginUrl || '#';
  const content = `
    <h2 style="color: #ffffff; margin-top: 0;">Welcome to ${gymName}, ${memberName}!</h2>
    <p>Your membership account has been created by the gym administration. To activate your access, please set up your own secure password.</p>

    ${memberId ? `
    <div style="background: #111827; border: 1px solid #10b981; border-radius: 8px; padding: 12px 16px; margin: 16px 0;">
      <p style="margin: 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; font-weight: 600;">Your Official Member ID:</p>
      <div style="font-family: monospace; font-size: 18px; font-weight: 800; color: #10b981; margin-top: 4px;">${memberId}</div>
      <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 11px;">Use this ID to scan in via the gym entrance QR code or identify your membership.</p>
    </div>
    ` : ''}

    <p><strong>Your Account Email:</strong> <span style="color: #38bdf8;">${email}</span></p>

    <div style="text-align: center; margin: 28px 0;">
      <a href="${targetUrl}" class="btn" style="background: #10b981; color: #ffffff !important; text-decoration: none; padding: 14px 28px; font-weight: 700; border-radius: 8px; display: inline-block;">Set Up Password & Activate Account</a>
    </div>

    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      &#9201; <strong>Important Security Note:</strong> This invitation link is unique to you, valid for <strong>24 hours</strong>, and can only be used once to set your password.
    </p>

    <div style="background: #0f172a; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 12px; color: #64748b; word-break: break-all;">
      If the button above does not work, copy and paste this link into your browser:<br/>
      <a href="${targetUrl}" style="color: #38bdf8; text-decoration: none;">${targetUrl}</a>
    </div>
  `;

  return {
    subject: `Welcome to ${gymName} - Activate Your Member Account (ID: ${memberId || ''})`,
    html: baseEmailLayout({
      title: `Welcome to ${gymName}`,
      preheader: `Activate your member account for ${gymName}. Member ID: ${memberId || ''}.`,
      content,
      gymName
    })
  };
};

export const passwordResetEmailTemplate = ({
  memberName,
  resetUrl,
  expiresInMinutes = 30,
  gymName = 'IronPulse Fitness'
}) => {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0;">Password Reset Request</h2>
    <p>Hello ${memberName},</p>
    <p>We received a request to reset your password for your ${gymName} account. Click the button below to choose a new password:</p>

    <p style="text-align: center;">
      <a href="${resetUrl}" class="btn">Reset My Password</a>
    </p>

    <p style="font-size: 13px; color: #94a3b8;">
      This password reset link will expire in ${expiresInMinutes} minutes. If you did not request a password reset, you can safely ignore this email.
    </p>
  `;

  return {
    subject: `Password Reset Request - ${gymName}`,
    html: baseEmailLayout({
      title: `Password Reset Request`,
      preheader: `Reset your password for ${gymName}`,
      content,
      gymName
    })
  };
};

export const paymentReceiptEmailTemplate = ({
  memberName,
  memberId,
  amount,
  currencySymbol = '₹',
  paymentMethod,
  transactionReference,
  paymentDate,
  planName,
  gymName = 'IronPulse Fitness'
}) => {
  const formattedDate = new Date(paymentDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const content = `
    <h2 style="color: #ffffff; margin-top: 0;">Payment Receipt</h2>
    <p>Thank you for your payment, ${memberName}! Here is a summary of your recent transaction:</p>

    <table class="table">
      <tr><th>Receipt / Ref:</th><td>${transactionReference}</td></tr>
      <tr><th>Member ID:</th><td>${memberId}</td></tr>
      <tr><th>Plan / Item:</th><td>${planName || 'Gym Membership'}</td></tr>
      <tr><th>Date:</th><td>${formattedDate}</td></tr>
      <tr><th>Payment Method:</th><td>${paymentMethod}</td></tr>
      <tr><th>Amount Paid:</th><td style="color: #10b981; font-weight: 700; font-size: 18px;">${currencySymbol}${amount}</td></tr>
    </table>

    <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
      You can also view and download receipts anytime directly from your Member Dashboard.
    </p>
  `;

  return {
    subject: `Payment Receipt: ${transactionReference} - ${gymName}`,
    html: baseEmailLayout({
      title: `Payment Receipt`,
      preheader: `Receipt for ${currencySymbol}${amount} paid to ${gymName}`,
      content,
      gymName
    })
  };
};

export const membershipRenewalReminderEmailTemplate = ({
  memberName,
  planName,
  expirationDate,
  portalUrl,
  gymName = 'IronPulse Fitness'
}) => {
  const formattedDate = new Date(expirationDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const content = `
    <h2 style="color: #ffffff; margin-top: 0;">Membership Renewal Reminder</h2>
    <p>Hello ${memberName},</p>
    <p>Your <strong>${planName}</strong> membership at ${gymName} is set to expire on <strong style="color: #f59e0b;">${formattedDate}</strong>.</p>
    <p>To continue enjoying uninterrupted access to the gym, group classes, and personal training, please renew your membership with our staff or through your portal.</p>

    <p style="text-align: center;">
      <a href="${portalUrl}" class="btn">View Membership Status</a>
    </p>
  `;

  return {
    subject: `Upcoming Membership Expiration - ${gymName}`,
    html: baseEmailLayout({
      title: `Membership Renewal Reminder`,
      preheader: `Your membership expires on ${formattedDate}`,
      content,
      gymName
    })
  };
};

export const membershipExpiredEmailTemplate = ({
  memberName,
  planName,
  portalUrl,
  gymName = 'IronPulse Fitness'
}) => {
  const content = `
    <h2 style="color: #ffffff; margin-top: 0;">Membership Expired</h2>
    <p>Hello ${memberName},</p>
    <p>Your <strong>${planName}</strong> membership at ${gymName} has now expired.</p>
    <p>We miss having you at the gym! Speak to our front desk team or visit your portal to renew your plan today.</p>

    <p style="text-align: center;">
      <a href="${portalUrl}" class="btn">Renew Membership</a>
    </p>
  `;

  return {
    subject: `Your Membership Has Expired - ${gymName}`,
    html: baseEmailLayout({
      title: `Membership Expired`,
      preheader: `Renew your gym membership at ${gymName}`,
      content,
      gymName
    })
  };
};
