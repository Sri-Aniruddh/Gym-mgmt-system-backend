import TokenService from '../services/tokenService.js';
import User from '../models/User.js';
import { errorResponse } from '../utils/apiResponse.js';

export const authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header: Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return errorResponse(res, 'Authentication required. No token provided.', 401);
    }

    let decoded;
    try {
      decoded = TokenService.verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return errorResponse(res, 'Session expired. Please log in again or refresh token.', 401);
      }
      return errorResponse(res, 'Invalid authentication token.', 401);
    }

    const user = await User.findById(decoded.id).select('+refreshTokenHash');
    if (!user) {
      return errorResponse(res, 'User associated with this token no longer exists.', 401);
    }

    if (user.status !== 'ACTIVE') {
      return errorResponse(res, 'Your account has been deactivated. Please contact gym administration.', 403);
    }

    // Attach user information to request
    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      memberId: user.memberId || null,
      mustChangePassword: user.mustChangePassword
    };

    next();
  } catch (error) {
    return errorResponse(res, 'Authentication failed', 500);
  }
};

/**
 * Middleware allowing users who must change password on first login
 */
export const allowFirstLoginOnly = async (req, res, next) => {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return errorResponse(res, 'First-login session token required', 401);
    }

    const decoded = TokenService.verifyAccessToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword
    };

    next();
  } catch (error) {
    return errorResponse(res, 'Invalid or expired first-login session', 401);
  }
};
