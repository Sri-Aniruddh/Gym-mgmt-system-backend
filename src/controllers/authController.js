import { z } from 'zod';
import User from '../models/User.js';
import Member from '../models/Member.js';
import TokenService from '../services/tokenService.js';
import EmailService from '../services/emailService.js';
import AuditService from '../services/auditService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

// Validation Schemas
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password or one-time credential is required')
});

export const firstTimePasswordSchema = z.object({
  newPassword: z.string().min(8, 'New password must be at least 8 characters long')
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address').toLowerCase().trim()
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  email: z.string().email('Please enter a valid email address').toLowerCase().trim(),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long')
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long')
});

export const setupPasswordSchema = z.object({
  token: z.string().min(1, 'Invitation token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters long')
});

export class AuthController {
  /**
   * Log in user (Admin or Member, supports standard password or one-time credential)
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email including sensitive credential fields
      const user = await User.findOne({ email }).select(
        '+passwordHash +oneTimeCredentialHash +invitationExpiresAt +refreshTokenHash'
      );

      if (!user) {
        return errorResponse(res, 'Invalid email or password credentials', 401);
      }

      if (user.status !== 'ACTIVE') {
        return errorResponse(res, 'This account is deactivated. Please contact the administrator.', 403);
      }

      let isPasswordMatch = false;
      let isOneTimeCredential = false;

      // 1. Check standard password
      isPasswordMatch = await user.comparePassword(password);

      // 2. If not standard password, check one-time invitation credential
      if (!isPasswordMatch && user.oneTimeCredentialHash) {
        const hashedInput = TokenService.hashToken(password.trim().toUpperCase());
        if (hashedInput === user.oneTimeCredentialHash) {
          // Check if credential has expired
          if (user.invitationExpiresAt && new Date() > user.invitationExpiresAt) {
            return errorResponse(res, 'Your one-time invitation credential has expired. Please ask the gym to resend.', 401);
          }
          isPasswordMatch = true;
          isOneTimeCredential = true;
        }
      }

      if (!isPasswordMatch) {
        return errorResponse(res, 'Invalid email or password credentials', 401);
      }

      // If logging in via one-time credential or mustChangePassword is true:
      // Require password change before granting full access
      if (isOneTimeCredential || user.mustChangePassword) {
        const firstLoginToken = TokenService.generateFirstLoginToken(user);
        return successResponse(res, 'First-time authentication successful. Please choose a new permanent password.', {
          mustChangePassword: true,
          firstLoginToken,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
          }
        });
      }

      // Standard successful login
      const accessToken = TokenService.generateAccessToken(user);
      const refreshToken = TokenService.generateRefreshToken(user);

      // Store hashed refresh token in DB
      user.refreshTokenHash = TokenService.hashToken(refreshToken);
      await user.save();

      // Set HTTP-only refresh token cookie
      res.cookie('refreshToken', refreshToken, TokenService.getRefreshCookieOptions());

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'USER_LOGIN',
        targetType: 'AUTH',
        targetId: user._id.toString(),
        details: { role: user.role }
      });

      return successResponse(res, 'Login successful', {
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          memberId: user.memberId || null,
          mustChangePassword: false
        }
      });
    } catch (error) {
      console.error('[AuthController.login]', error);
      return errorResponse(res, 'Login failed', 500);
    }
  }

  /**
   * Set new password for first-time invited members
   */
  static async firstTimePassword(req, res) {
    try {
      const { newPassword } = req.body;
      const userId = req.user.id;

      const user = await User.findById(userId).select(
        '+passwordHash +oneTimeCredentialHash +invitationTokenHash'
      );

      if (!user) {
        return errorResponse(res, 'User not found', 404);
      }

      const passwordHash = await User.hashPassword(newPassword);
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;
      user.oneTimeCredentialHash = undefined;
      user.invitationTokenHash = undefined;
      user.invitationExpiresAt = undefined;

      // Update Member invitationStatus to ACCEPTED
      if (user.role === 'MEMBER') {
        await Member.findOneAndUpdate(
          { userId: user._id },
          { invitationStatus: 'ACCEPTED' }
        );
      }

      // Issue standard tokens
      const accessToken = TokenService.generateAccessToken(user);
      const refreshToken = TokenService.generateRefreshToken(user);
      user.refreshTokenHash = TokenService.hashToken(refreshToken);
      await user.save();

      res.cookie('refreshToken', refreshToken, TokenService.getRefreshCookieOptions());

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'FIRST_LOGIN_PASSWORD_SET',
        targetType: 'AUTH',
        targetId: user._id.toString()
      });

      return successResponse(res, 'Password successfully set! Welcome to the gym.', {
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          memberId: user.memberId || null,
          mustChangePassword: false
        }
      });
    } catch (error) {
      console.error('[AuthController.firstTimePassword]', error);
      return errorResponse(res, 'Failed to set password', 500);
    }
  }

  /**
   * Validate invitation token and return member details for setup page
   */
  static async verifyInvitationToken(req, res) {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return errorResponse(res, 'Invitation token is required', 400);
      }

      const hashedToken = TokenService.hashToken(token.trim());

      const user = await User.findOne({
        invitationTokenHash: hashedToken
      }).select('+invitationTokenHash +invitationExpiresAt');

      if (!user) {
        return errorResponse(res, 'This invitation link is invalid or has already been used.', 400);
      }

      if (user.invitationExpiresAt && new Date() > user.invitationExpiresAt) {
        return errorResponse(
          res,
          'This invitation link has expired. Please ask your gym administrator to resend the invitation.',
          400
        );
      }

      if (user.status !== 'ACTIVE') {
        return errorResponse(res, 'This account is currently deactivated. Please contact the administrator.', 403);
      }

      return successResponse(res, 'Invitation token is valid', {
        email: user.email,
        name: user.name,
        memberId: user.memberId || null
      });
    } catch (error) {
      console.error('[AuthController.verifyInvitationToken]', error);
      return errorResponse(res, 'Failed to verify invitation link', 500);
    }
  }

  /**
   * Set new password using invitation token (Member Setup flow)
   */
  static async setupPassword(req, res) {
    try {
      const { token, newPassword } = req.body;

      if (!token) {
        return errorResponse(res, 'Invitation token is required', 400);
      }

      const hashedToken = TokenService.hashToken(token.trim());

      const user = await User.findOne({
        invitationTokenHash: hashedToken
      }).select('+passwordHash +invitationTokenHash +invitationExpiresAt');

      if (!user) {
        return errorResponse(res, 'This invitation link is invalid or has already been used.', 400);
      }

      if (user.invitationExpiresAt && new Date() > user.invitationExpiresAt) {
        return errorResponse(
          res,
          'This invitation link has expired. Please ask your gym administrator to resend the invitation.',
          400
        );
      }

      if (user.status !== 'ACTIVE') {
        return errorResponse(res, 'This account is currently deactivated. Please contact the administrator.', 403);
      }

      // Hash password using bcrypt via static helper
      const passwordHash = await User.hashPassword(newPassword);
      user.passwordHash = passwordHash;
      user.mustChangePassword = false;

      // Invalidate the invitation token so it cannot be reused
      user.invitationTokenHash = undefined;
      user.invitationExpiresAt = undefined;
      user.oneTimeCredentialHash = undefined;

      // Update Member invitationStatus to ACCEPTED
      if (user.role === 'MEMBER') {
        await Member.findOneAndUpdate(
          { userId: user._id },
          { invitationStatus: 'ACCEPTED' }
        );
      }

      // Issue tokens for instant session
      const accessToken = TokenService.generateAccessToken(user);
      const refreshToken = TokenService.generateRefreshToken(user);
      user.refreshTokenHash = TokenService.hashToken(refreshToken);
      await user.save();

      res.cookie('refreshToken', refreshToken, TokenService.getRefreshCookieOptions());

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'INVITATION_PASSWORD_SET',
        targetType: 'AUTH',
        targetId: user._id.toString(),
        details: { email: user.email }
      });

      return successResponse(res, 'Password created successfully! Welcome to the gym.', {
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          memberId: user.memberId || null,
          mustChangePassword: false
        }
      });
    } catch (error) {
      console.error('[AuthController.setupPassword]', error);
      return errorResponse(res, 'Failed to complete password setup', 500);
    }
  }

  /**
   * Refresh Access Token
   */
  static async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!refreshToken) {
        return errorResponse(res, 'Refresh token required', 401);
      }

      let decoded;
      try {
        decoded = TokenService.verifyRefreshToken(refreshToken);
      } catch (err) {
        return errorResponse(res, 'Invalid or expired refresh token. Please log in again.', 401);
      }

      const user = await User.findById(decoded.id).select('+refreshTokenHash');
      if (!user || user.status !== 'ACTIVE') {
        return errorResponse(res, 'User not active or does not exist', 401);
      }

      const hashedToken = TokenService.hashToken(refreshToken);
      if (user.refreshTokenHash !== hashedToken) {
        return errorResponse(res, 'Refresh token revoked or invalid', 401);
      }

      // Rotate tokens
      const newAccessToken = TokenService.generateAccessToken(user);
      const newRefreshToken = TokenService.generateRefreshToken(user);
      user.refreshTokenHash = TokenService.hashToken(newRefreshToken);
      await user.save();

      res.cookie('refreshToken', newRefreshToken, TokenService.getRefreshCookieOptions());

      return successResponse(res, 'Token refreshed successfully', {
        accessToken: newAccessToken
      });
    } catch (error) {
      console.error('[AuthController.refreshToken]', error);
      return errorResponse(res, 'Failed to refresh token', 500);
    }
  }

  /**
   * Logout user and clear cookies
   */
  static async logout(req, res) {
    try {
      if (req.user?.id) {
        await User.findByIdAndUpdate(req.user.id, { $unset: { refreshTokenHash: 1 } });
      }

      res.clearCookie('refreshToken', TokenService.getRefreshCookieOptions());
      res.clearCookie('accessToken');

      return successResponse(res, 'Logged out successfully');
    } catch (error) {
      return successResponse(res, 'Logged out successfully');
    }
  }

  /**
   * Request password reset link via Gmail SMTP
   */
  static async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      // Always return positive response to avoid user enumeration
      if (!user) {
        return successResponse(res, 'If an account matches that email, a password reset link has been dispatched.');
      }

      const resetToken = TokenService.generateRandomToken();
      user.resetPasswordTokenHash = TokenService.hashToken(resetToken);
      user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await user.save();

      await EmailService.sendPasswordReset({
        memberName: user.name,
        email: user.email,
        resetToken
      });

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'FORGOT_PASSWORD_REQUESTED',
        targetType: 'AUTH',
        targetId: user._id.toString()
      });

      return successResponse(res, 'If an account matches that email, a password reset link has been dispatched.');
    } catch (error) {
      console.error('[AuthController.forgotPassword]', error);
      return errorResponse(res, 'Failed to process password reset request', 500);
    }
  }

  /**
   * Reset password with token
   */
  static async resetPassword(req, res) {
    try {
      const { email, token, newPassword } = req.body;
      const hashedToken = TokenService.hashToken(token);

      const user = await User.findOne({
        email,
        resetPasswordTokenHash: hashedToken,
        resetPasswordExpiresAt: { $gt: new Date() }
      }).select('+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt');

      if (!user) {
        return errorResponse(res, 'Password reset token is invalid or has expired', 400);
      }

      user.passwordHash = await User.hashPassword(newPassword);
      user.resetPasswordTokenHash = undefined;
      user.resetPasswordExpiresAt = undefined;
      user.mustChangePassword = false;
      await user.save();

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'PASSWORD_RESET_COMPLETED',
        targetType: 'AUTH',
        targetId: user._id.toString()
      });

      return successResponse(res, 'Password has been reset successfully. You can now log in.');
    } catch (error) {
      console.error('[AuthController.resetPassword]', error);
      return errorResponse(res, 'Failed to reset password', 500);
    }
  }

  /**
   * Get current authenticated user profile
   */
  static async getMe(req, res) {
    try {
      const user = await User.findById(req.user.id);
      if (!user) {
        return errorResponse(res, 'User not found', 404);
      }

      let memberDetails = null;
      if (user.role === 'MEMBER') {
        memberDetails = await Member.findOne({ userId: user._id })
          .populate('membershipId');
      }

      return successResponse(res, 'User profile retrieved', {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          memberId: user.memberId || null,
          status: user.status,
          createdAt: user.createdAt
        },
        member: memberDetails
      });
    } catch (error) {
      return errorResponse(res, 'Failed to retrieve profile', 500);
    }
  }

  /**
   * Change password for logged-in user
   */
  static async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user.id).select('+passwordHash');

      const isCurrentValid = await user.comparePassword(currentPassword);
      if (!isCurrentValid) {
        return errorResponse(res, 'Current password does not match', 400);
      }

      user.passwordHash = await User.hashPassword(newPassword);
      await user.save();

      await AuditService.logAction({
        req,
        actorUser: user,
        action: 'PASSWORD_CHANGED',
        targetType: 'USER',
        targetId: user._id.toString()
      });

      return successResponse(res, 'Password changed successfully');
    } catch (error) {
      return errorResponse(res, 'Failed to change password', 500);
    }
  }
}

export default AuthController;
