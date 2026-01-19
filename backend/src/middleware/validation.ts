import { body, param, query, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * Email validation regex (basic validation)
 */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * UUID validation regex
 */
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize string input - remove HTML tags and trim
 */
export function sanitizeString(input: string | undefined | null): string | undefined {
  if (!input || typeof input !== 'string') return undefined;
  return input.trim().replace(/<[^>]*>/g, '');
}

/**
 * Validate UUID parameter
 */
export const validateUUID = param('id')
  .matches(uuidRegex)
  .withMessage('Invalid ID format');

/**
 * Validate email format
 */
export const validateEmail = (field: string) =>
  body(field)
    .trim()
    .matches(emailRegex)
    .withMessage(`Invalid ${field} format`)
    .normalizeEmail();

/**
 * Validate vendor creation/update
 */
export const validateVendor = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 255 })
    .withMessage('Name must be 255 characters or less'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .matches(emailRegex)
    .withMessage('Invalid email format')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email must be 255 characters or less'),
  body('contactName')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Contact name must be 255 characters or less'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 255 })
    .withMessage('Phone must be 255 characters or less'),
  body('address')
    .optional()
    .trim()
    .custom((value) => {
      // Allow text addresses
      return true;
    }),
  body('notes')
    .optional()
    .trim(),
];

/**
 * Validate RFP creation/update
 */
export const validateRFP = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 255 })
    .withMessage('Title must be 255 characters or less'),
  body('description')
    .trim()
    .notEmpty()
    .withMessage('Description is required'),
  body('budget')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseFloat(value);
      return !isNaN(num) && num >= 0;
    })
    .withMessage('Budget must be a positive number'),
  body('deadline')
    .optional()
    .custom((value) => {
      if (!value) return true;
      const date = new Date(value);
      return !isNaN(date.getTime());
    })
    .withMessage('Invalid deadline date format'),
  body('requirements')
    .optional()
    .isObject()
    .withMessage('Requirements must be an object'),
  body('status')
    .optional()
    .isIn(['draft', 'sent', 'closed'])
    .withMessage('Status must be draft, sent, or closed'),
];

/**
 * Validate proposal creation/update
 */
export const validateProposal = [
  body('rfpId')
    .matches(uuidRegex)
    .withMessage('Invalid RFP ID format'),
  body('vendorId')
    .matches(uuidRegex)
    .withMessage('Invalid vendor ID format'),
  body('totalPrice')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseFloat(value);
      return !isNaN(num) && num >= 0;
    })
    .withMessage('Total price must be a positive number'),
  body('deliveryDays')
    .optional()
    .custom((value) => {
      if (value === null || value === undefined || value === '') return true;
      const num = parseInt(value);
      return !isNaN(num) && num >= 0;
    })
    .withMessage('Delivery days must be a positive integer'),
];

/**
 * Validate conversation message
 */
export const validateConversationMessage = [
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ max: 10000 })
    .withMessage('Message must be 10000 characters or less'),
  body('sessionId')
    .trim()
    .notEmpty()
    .withMessage('Session ID is required'),
];

/**
 * Validate session ID query parameter
 */
export const validateSessionIdQuery = query('sessionId')
  .trim()
  .notEmpty()
  .withMessage('Session ID is required');

/**
 * Middleware to check validation results
 */
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};
