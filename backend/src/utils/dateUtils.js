/**
 * Date utility functions for consistent timezone handling across the backend.
 * All dates should be interpreted/displayed in US Eastern time for consistency.
 */

// Default timezone for the application (US Eastern)
const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Get date parts (year, month, day, hours, minutes, seconds) in a specific timezone
 * @param {Date} date - The date to parse
 * @param {string} timezone - The timezone to use
 * @returns {Object} - Object with year, month (0-indexed), day, hours, minutes, seconds
 */
function getDatePartsInTimezone(date, timezone = DEFAULT_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type)?.value;
  return {
    year: parseInt(getPart('year')),
    month: parseInt(getPart('month')) - 1, // 0-indexed like JS Date
    day: parseInt(getPart('day')),
    hours: parseInt(getPart('hour')),
    minutes: parseInt(getPart('minute')),
    seconds: parseInt(getPart('second'))
  };
}

/**
 * Get today's date string (YYYY-MM-DD) in the specified timezone
 * @param {string} timezone - The timezone to use
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function getTodayInTimezone(timezone = DEFAULT_TIMEZONE) {
  const parts = getDatePartsInTimezone(new Date(), timezone);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Get tomorrow's date string (YYYY-MM-DD) in the specified timezone
 * @param {string} timezone - The timezone to use
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function getTomorrowInTimezone(timezone = DEFAULT_TIMEZONE) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const parts = getDatePartsInTimezone(tomorrow, timezone);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Get a date string N days from now in the specified timezone
 * @param {number} days - Number of days from now (can be negative for past)
 * @param {string} timezone - The timezone to use
 * @returns {string} - Date string in YYYY-MM-DD format
 */
function getDateInTimezone(days = 0, timezone = DEFAULT_TIMEZONE) {
  const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const parts = getDatePartsInTimezone(futureDate, timezone);
  return `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/**
 * Create a Date object for a specific date/time in the user's timezone
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @param {number} hours - Hour (0-23)
 * @param {number} minutes - Minutes (0-59)
 * @param {string} timezone - The timezone to use
 * @returns {Date} - Date object representing the specified time in the timezone
 */
function createDateInTimezone(dateStr, hours = 0, minutes = 0, timezone = DEFAULT_TIMEZONE) {
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Create a date at the specified time, adjusting for timezone offset
  const testDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  
  // Get the offset for this date in the target timezone
  const localParts = getDatePartsInTimezone(testDate, timezone);
  
  // Calculate the difference and adjust
  const hourDiff = hours - localParts.hours;
  const minDiff = minutes - localParts.minutes;
  const dayDiff = day - localParts.day;
  
  // Adjust the UTC time to get the correct local time
  testDate.setUTCHours(testDate.getUTCHours() + hourDiff);
  testDate.setUTCMinutes(testDate.getUTCMinutes() + minDiff);
  testDate.setUTCDate(testDate.getUTCDate() + dayDiff);
  
  return testDate;
}

/**
 * Get current time parts in timezone
 * @param {string} timezone - The timezone to use
 * @returns {Object} - Object with year, month, day, hours, minutes, seconds
 */
function getCurrentTimePartsInTimezone(timezone = DEFAULT_TIMEZONE) {
  return getDatePartsInTimezone(new Date(), timezone);
}

/**
 * Format a date for display in the user's timezone
 * @param {Date|string} dateValue - The date to format
 * @param {string} timezone - The timezone to use
 * @returns {string} - Formatted date string
 */
function formatDate(dateValue, timezone = DEFAULT_TIMEZONE) {
  const date = new Date(dateValue);
  return date.toLocaleDateString('en-US', { timeZone: timezone });
}

/**
 * Format a time for display in the user's timezone
 * @param {Date|string} dateValue - The date/time to format
 * @param {string} timezone - The timezone to use
 * @returns {string} - Formatted time string
 */
function formatTime(dateValue, timezone = DEFAULT_TIMEZONE) {
  const date = new Date(dateValue);
  return date.toLocaleTimeString('en-US', { 
    timeZone: timezone, 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

/**
 * Format a date and time for display in the user's timezone
 * @param {Date|string} dateValue - The date/time to format
 * @param {string} timezone - The timezone to use
 * @returns {string} - Formatted date and time string
 */
function formatDateTime(dateValue, timezone = DEFAULT_TIMEZONE) {
  return `${formatDate(dateValue, timezone)} ${formatTime(dateValue, timezone)}`;
}

/**
 * Format month and year for display
 * @param {Date|string} dateValue - The date to format
 * @param {string} timezone - The timezone to use
 * @returns {string} - Formatted month and year string
 */
function formatMonthYear(dateValue, timezone = DEFAULT_TIMEZONE) {
  const date = new Date(dateValue);
  return date.toLocaleDateString('en-US', { 
    timeZone: timezone, 
    month: 'short', 
    year: 'numeric' 
  });
}

/**
 * Get the current year in the specified timezone
 * @param {string} timezone - The timezone to use
 * @returns {number} - Current year
 */
function getCurrentYear(timezone = DEFAULT_TIMEZONE) {
  const parts = getDatePartsInTimezone(new Date(), timezone);
  return parts.year;
}

export {
  DEFAULT_TIMEZONE,
  getDatePartsInTimezone,
  getTodayInTimezone,
  getTomorrowInTimezone,
  getDateInTimezone,
  createDateInTimezone,
  getCurrentTimePartsInTimezone,
  formatDate,
  formatTime,
  formatDateTime,
  formatMonthYear,
  getCurrentYear
};
