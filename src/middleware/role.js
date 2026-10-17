import { errorResponse } from '../utils/apiResponse.js';

/**
 * Role-based authorization middleware
 * @param  {...string} roles Allowed roles (e.g. 'ADMIN', 'MEMBER')
 */
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required before checking permissions', 401);
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied. Requires one of the following roles: [${roles.join(', ')}]`,
        403
      );
    }

    next();
  };
};

export default authorize;
