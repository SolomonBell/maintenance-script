/**
 * Utils.gs
 * Shared utility functions used across the project.
 */

var Utils = (function () {

  /**
   * Formats a Date object as an ISO 8601 string (YYYY-MM-DD).
   * @param {Date} date
   * @returns {string}
   */
  function formatDate(date) {
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  /**
   * Returns true if a value is null, undefined, or an empty string.
   * @param {*} value
   * @returns {boolean}
   */
  function isEmpty(value) {
    return value === null || value === undefined || value === '';
  }

  /**
   * Safely parses JSON, returning null on failure instead of throwing.
   * @param {string} str
   * @returns {Object|null}
   */
  function safeParseJson(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      Logger.log('safeParseJson failed: ' + e.message);
      return null;
    }
  }

  /**
   * Generates a random alphanumeric ID of the given length.
   * @param {number} [length=12]
   * @returns {string}
   */
  function generateId(length) {
    length = length || 12;
    return Utilities.getUuid().replace(/-/g, '').slice(0, length);
  }

  /**
   * Splits a full name string into first and last name.
   * Rule: firstName = first token, lastName = all remaining tokens.
   * Single-token names produce an empty lastName.
   * @param {string} fullName
   * @returns {{ firstName: string, lastName: string }}
   */
  function splitFullName(fullName) {
    var trimmed = (fullName || '').trim();
    var spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) {
      return { firstName: trimmed, lastName: '' };
    }
    return {
      firstName: trimmed.slice(0, spaceIndex),
      lastName:  trimmed.slice(spaceIndex + 1).trim(),
    };
  }

  return {
    formatDate: formatDate,
    isEmpty: isEmpty,
    safeParseJson: safeParseJson,
    generateId: generateId,
    splitFullName: splitFullName,
  };
})();
