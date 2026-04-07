/**
 * FormHandlers.gs
 * Handles Google Form submission events (onFormSubmit trigger).
 */

var FormHandlers = (function () {

  /**
   * Main form submission handler. Wire this to an installable onFormSubmit trigger.
   * @param {Object} e - The form submit event object.
   */
  /**
   * onFormSubmit trigger handler — Phase 2 of the booking flow.
   *
   * Finds the booking row in the Bookings sheet by email address and updates:
   *   - Request Type  (column 7)
   *   - Notes         (column 10)
   *   - Status        (column 11)
   *
   * Column positions match the confirmed sheet schema (1-indexed).
   * Wire this to an installable onFormSubmit trigger in the Apps Script editor.
   *
   * @param {Object} e - The form submit event object.
   */
  function onSubmit(e) {
    var responses = parseResponses(e.response);
    Logger.log('Form submitted: ' + JSON.stringify(responses));

    var email       = (responses['Email Address'] || '').trim();
    var requestType = (responses['Request Type']  || '').trim();
    var notes       = (responses['Notes']         || '').trim();

    if (!email) {
      Logger.log('onSubmit: no email in form response — cannot match booking row');
      return;
    }

    // Locate the row in the Bookings sheet where the Email column matches.
    var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
      .getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);

    if (!sheet) {
      Logger.log('onSubmit: sheet "' + CONFIG.BOOKINGS_SHEET_NAME + '" not found');
      return;
    }

    var data    = sheet.getDataRange().getValues();
    var headers = data[0];
    var emailCol = headers.indexOf('Email');  // 0-indexed column position

    if (emailCol === -1) {
      Logger.log('onSubmit: "Email" column not found in sheet headers');
      return;
    }

    // Find the last matching row (handles the unlikely duplicate-email case
    // by updating the most recently appended booking for this customer).
    var targetRowIndex = -1;
    for (var i = data.length - 1; i >= 1; i--) {
      if ((data[i][emailCol] || '').trim().toLowerCase() === email.toLowerCase()) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      Logger.log('onSubmit: no booking row found for email ' + email);
      return;
    }

    // Sheet rows are 1-indexed; data array is 0-indexed. Add 1 to convert.
    var sheetRow = targetRowIndex + 1;

    // Column positions (1-indexed) matching the confirmed schema:
    //   7 = Request Type, 10 = Notes, 11 = Status
    sheet.getRange(sheetRow, 7).setValue(requestType);
    sheet.getRange(sheetRow, 10).setValue(notes);
    sheet.getRange(sheetRow, 11).setValue('Form Submitted');

    Logger.log('onSubmit: updated row ' + sheetRow + ' for email ' + email);
  }

  /**
   * Converts a FormResponse into a plain key-value object.
   * @param {FormResponse} response
   * @returns {Object}
   */
  function parseResponses(response) {
    var result = { timestamp: response.getTimestamp() };
    response.getItemResponses().forEach(function (itemResponse) {
      result[itemResponse.getItem().getTitle()] = itemResponse.getResponse();
    });
    return result;
  }

  /**
   * Builds a pre-filled Google Form URL for the intake form.
   *
   * Google Forms accepts pre-filled answers as query parameters in the form:
   *   https://docs.google.com/forms/d/e/{FORM_ID}/viewform?usp=pp_url
   *     &entry.XXXXXXXXX=value
   *
   * Each field's entry ID is found via the form's "Get pre-filled link" option.
   * Values must be URL-encoded so special characters (spaces, +, &, etc.) are safe.
   *
   * @param {string} fullName    - Respondent's full name.
   * @param {string} phoneNumber - Respondent's phone number.
   * @param {string} unitNumber  - Unit/apartment number.
   * @param {string} email       - Respondent's email address.
   * @returns {string} The pre-filled form URL.
   * @throws {Error} If any required field is missing.
   */
  function buildPrefilledUrl(fullName, phoneNumber, unitNumber, email) {
    // Validate — all four fields are required
    if (Utils.isEmpty(fullName))    throw new Error('buildPrefilledUrl: fullName is required');
    if (Utils.isEmpty(phoneNumber)) throw new Error('buildPrefilledUrl: phoneNumber is required');
    if (Utils.isEmpty(unitNumber))  throw new Error('buildPrefilledUrl: unitNumber is required');
    if (Utils.isEmpty(email))       throw new Error('buildPrefilledUrl: email is required');

    var base = 'https://docs.google.com/forms/d/e/'
      + CONFIG.INTAKE_FORM_ID
      + '/viewform?usp=pp_url';

    var fields = CONFIG.INTAKE_FORM_FIELDS;

    // encodeURIComponent handles spaces, ampersands, slashes, and other
    // characters that would otherwise break the query string.
    var params = [
      fields.FULL_NAME    + '=' + encodeURIComponent(fullName),
      fields.PHONE_NUMBER + '=' + encodeURIComponent(phoneNumber),
      fields.UNIT_NUMBER  + '=' + encodeURIComponent(unitNumber),
      fields.EMAIL        + '=' + encodeURIComponent(email),
    ];

    return base + '&' + params.join('&');
  }

  return { onSubmit: onSubmit, buildPrefilledUrl: buildPrefilledUrl };
})();
