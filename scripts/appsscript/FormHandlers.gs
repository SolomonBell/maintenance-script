/**
 * FormHandlers.gs
 * Handles Google Form submission events (onFormSubmit trigger).
 */

var FormHandlers = (function () {

  /**
   * Main form submission handler. Wire this to an installable onFormSubmit trigger.
   * @param {Object} e - The form submit event object.
   */
  function onSubmit(e) {
    var responses = parseResponses(e.response);
    Logger.log('Form submitted: ' + JSON.stringify(responses));

    // TODO: route to downstream services based on form content
    // Example: SheetService.appendRow(CONFIG.SPREADSHEET_ID, 'Sheet1', responses);
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
