/**
 * Input validation and sanitization helpers for Roadway API.
 */

const MAX_NAME_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 10000;
const MAX_COMMENT_LENGTH = 5000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Strip HTML tags from a string to prevent XSS.
 * Replaces < and > with their HTML entities.
 */
function sanitizeHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validate that a string is within length limits.
 * Returns an error message or null if valid.
 */
function validateLength(value, fieldName, maxLength) {
  if (typeof value === "string" && value.length > maxLength) {
    return `${fieldName} must be ${maxLength} characters or less`;
  }
  return null;
}

/**
 * Validate email format.
 * Returns an error message or null if valid.
 */
function validateEmail(email) {
  if (typeof email !== "string" || !EMAIL_REGEX.test(email)) {
    return "Invalid email format";
  }
  return null;
}

/**
 * Validate a numeric field is >= 0.
 * Returns an error message or null if valid.
 */
function validateNonNegativeNumber(value, fieldName) {
  if (value !== undefined && value !== null) {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      return `${fieldName} must be a non-negative number`;
    }
  }
  return null;
}

module.exports = {
  MAX_NAME_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_COMMENT_LENGTH,
  sanitizeHtml,
  validateLength,
  validateEmail,
  validateNonNegativeNumber,
};
