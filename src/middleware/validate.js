import { errorResponse } from '../utils/apiResponse.js';

/**
 * Zod validation middleware factory
 * @param {import('zod').ZodSchema} schema
 * @param {'body' | 'query' | 'params'} source Target object on req
 */
export const validate = (schema, source = 'body') => {
  return async (req, res, next) => {
    try {
      const parsed = await schema.parseAsync(req[source]);
      req[source] = parsed; // Replace with sanitized/validated data
      next();
    } catch (err) {
      if (err.errors) {
        const formattedErrors = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return errorResponse(res, 'Validation failed for request data', 422, formattedErrors);
      }
      return errorResponse(res, err.message || 'Validation error', 400);
    }
  };
};

export default validate;
