/**
 * Date utility functions for handling timezone-safe date operations.
 * 
 * When dates are stored in the database as DATE type (without time),
 * they come back as strings like "2025-12-10" or "2025-12-10T00:00:00.000Z".
 * Using parseISO() from date-fns interprets these as UTC midnight, which
 * can cause the date to appear as the previous day for users in timezones
 * behind UTC (like US timezones).
 * 
 * These utilities ensure dates are interpreted as local dates.
 */

/**
 * Parse a date string as a local date (not UTC).
 * Handles both "2025-12-10" and "2025-12-10T00:00:00.000Z" formats.
 * 
 * @param dateStr - A date string from the API (e.g., "2025-12-10")
 * @returns A Date object representing that date at local midnight
 */
export const parseAsLocalDate = (dateStr: string): Date => {
  // Extract just the date portion (YYYY-MM-DD)
  const datePart = dateStr.split('T')[0]
  const [year, month, day] = datePart.split('-').map(Number)
  // Create date at local midnight
  return new Date(year, month - 1, day)
}

/**
 * Convert a local date string to an ISO string for API submission.
 * Creates the date at noon local time to avoid day boundary issues
 * when the server converts to its timezone.
 * 
 * @param dateStr - A date string from a form input (e.g., "2025-12-10")
 * @returns An ISO string representing that date
 */
export const localDateToISO = (dateStr: string): string => {
  const [year, month, day] = dateStr.split('-').map(Number)
  // Create date at noon local time to avoid day boundary issues
  const date = new Date(year, month - 1, day, 12, 0, 0)
  return date.toISOString()
}
