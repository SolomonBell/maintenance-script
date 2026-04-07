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

function debugSpreadsheetAccess() {
  var id = CONFIG.SPREADSHEET_ID;
  Logger.log('SPREADSHEET_ID value: [' + id + ']');
  Logger.log('SPREADSHEET_ID length: ' + (id ? id.length : 'null/undefined'));

  if (!id) {
    Logger.log('RESULT: SPREADSHEET_ID is null or empty');
    return;
  }

  try {
    var ss = SpreadsheetApp.openById(id);
    Logger.log('Spreadsheet opened OK: ' + ss.getName());
  } catch (err) {
    Logger.log('RESULT: openById failed — ' + err.message);
    return;
  }

  var sheetName = CONFIG.BOOKINGS_SHEET_NAME;
  Logger.log('Looking for sheet tab: [' + sheetName + ']');
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    Logger.log('RESULT: Sheet tab not found');
  } else {
    Logger.log('RESULT: Sheet tab found OK');
  }
}
