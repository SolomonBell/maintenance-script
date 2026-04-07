/**
 * SheetService.gs
 * Helpers for reading from and writing to Google Sheets.
 */

var SheetService = (function () {

  /**
   * Returns all rows from a sheet as an array of objects keyed by header row.
   * @param {string} spreadsheetId
   * @param {string} sheetName
   * @returns {Object[]}
   */
  function getRows(spreadsheetId, sheetName) {
    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    return data.slice(1).map(function (row) {
      return headers.reduce(function (obj, header, i) {
        obj[header] = row[i];
        return obj;
      }, {});
    });
  }

  /**
   * Appends a row to a sheet.
   * @param {string} spreadsheetId
   * @param {string} sheetName
   * @param {Array} rowValues - Ordered values matching the sheet columns.
   */
  function appendRow(spreadsheetId, sheetName, rowValues) {
    var sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(sheetName);
    sheet.appendRow(rowValues);
  }

  /**
   * Finds the first row where a column matches a value.
   * @param {string} spreadsheetId
   * @param {string} sheetName
   * @param {string} columnHeader
   * @param {*} value
   * @returns {Object|null}
   */
  function findRow(spreadsheetId, sheetName, columnHeader, value) {
    var rows = getRows(spreadsheetId, sheetName);
    return rows.find(function (row) { return row[columnHeader] === value; }) || null;
  }

  return { getRows: getRows, appendRow: appendRow, findRow: findRow };
})();
