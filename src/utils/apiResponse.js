/**
 * Standardized API response formatters
 */

export const successResponse = (res, message, data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

export const paginatedResponse = (res, message, data, pagination, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination: {
      total: pagination.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(pagination.total / pagination.limit),
      hasNextPage: pagination.page * pagination.limit < pagination.total,
      hasPrevPage: pagination.page > 1
    },
    timestamp: new Date().toISOString()
  });
};

export const errorResponse = (res, message, statusCode = 400, errors = null) => {
  const payload = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
  if (errors) {
    payload.errors = errors;
  }
  return res.status(statusCode).json(payload);
};
