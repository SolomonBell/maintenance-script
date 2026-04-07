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

  return { onSubmit: onSubmit };
})();
