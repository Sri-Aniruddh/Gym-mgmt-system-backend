import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'super_secret_jwt_access_key_gym_prod_2026_xyz123';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super_secret_jwt_refresh_key_gym_prod_2026_abc987';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export class TokenService {
  /**
   * Generate access token for authenticated requests
   */
  static generateAccessToken(user) {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        memberId: user.memberId || null,
        name: user.name
      },
      ACCESS_SECRET,
      { expiresIn: ACCESS_EXPIRY }
    );
  }

  /**
   * Generate refresh token for issuing new access tokens
   */
  static generateRefreshToken(user) {
    return jwt.sign(
      {
        id: user._id
      },
      REFRESH_SECRET,
      { expiresIn: REFRESH_EXPIRY }
    );
  }

  /**
   * Verify an access token
   */
  static verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
  }

  /**
   * Verify a refresh token
   */
  static verifyRefreshToken(token) {
    return jwt.verify(token, REFRESH_SECRET);
  }

  /**
   * Generate temporary first-login token allowing only password reset
   */
  static generateFirstLoginToken(user) {
    return jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
        isFirstLogin: true
      },
      ACCESS_SECRET,
      { expiresIn: '30m' }
    );
  }

  /**
   * Cryptographically secure SHA-256 hash
   */
  static hashToken(rawToken) {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Generate high-entropy one-time login credential
   * Format: 8-character uppercase alphanumeric (e.g. "K9X4-M2P7")
   */
  static generateOneTimeCredential() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // Base32 unambiguous charset
    const bytes = crypto.randomBytes(8);
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[bytes[i] % chars.length];
      if (i === 3) code += '-';
    }
    return code;
  }

  /**
   * Generate random invitation / reset token
   */
  static generateRandomToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Cookie configuration for Refresh Token
   */
  static getRefreshCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd, // true in production HTTPS
      sameSite: isProd ? 'none' : 'lax', // 'none' allows cross-domain (Vercel <-> Render) with HTTPS
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    };
  }
}

export default TokenService;
