import { errorResponse } from '../utils/apiResponse.js';

export const notFoundHandler = (req, res) => {
  return errorResponse(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);
};

export const globalErrorHandler = (err, req, res, next) => {
  console.error('[GlobalErrorHandler]', err);

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((el) => ({
      field: el.path,
      message: el.message
    }));
    return errorResponse(res, 'Database validation failed', 422, errors);
  }

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const val = err.keyValue ? err.keyValue[field] : '';
    return errorResponse(res, `Duplicate entry: A record with ${field} '${val}' already exists.`, 409);
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return errorResponse(res, `Invalid ID format for parameter '${err.path}'`, 400);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Invalid security token', 401);
  }
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token has expired', 401);
  }

  // Multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return errorResponse(res, 'File too large. Maximum size allowed is 5MB.', 400);
  }
  if (err.message && err.message.includes('Only image files')) {
    return errorResponse(res, err.message, 400);
  }
  if (err.name === 'MulterError') {
    return errorResponse(res, err.message || 'File upload error', 400);
  }

  // General server error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error occurred'
    : (err.message || 'Internal server error');

  return errorResponse(res, message, statusCode);
};

export default globalErrorHandler;
