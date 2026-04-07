/**
 * Code.gs
 * Entry point for the Google Apps Script web app.
 * Routes GET and POST requests to the appropriate handlers.
 */

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return WebhookHandlers.route(e);
}

/**
 * Top-level form submit handler.
 * This must be a global function for the Apps Script trigger system to call it.
 * Wire this via installFormSubmitTrigger() below — do NOT add it manually in the UI.
 * @param {Object} e - The onFormSubmit event object.
 */
function formSubmitTrigger(e) {
  FormHandlers.onSubmit(e);
}

/**
 * One-time setup: installs the onFormSubmit trigger for the intake form.
 * Run this function ONCE manually from the Apps Script editor.
 * After running, confirm the trigger appears under Triggers (clock icon).
 * Do NOT run it again — it will create duplicate triggers.
 */
function installFormSubmitTrigger() {
  var formId = 'FORM_EDIT_ID_REMOVED';
  var form = FormApp.openById(formId);

  var existing = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'formSubmitTrigger';
  });
  if (existing.length > 0) {
    Logger.log('installFormSubmitTrigger: trigger already exists — skipping');
    return;
  }

  ScriptApp.newTrigger('formSubmitTrigger')
    .forForm(form)
    .onFormSubmit()
    .create();

  Logger.log('installFormSubmitTrigger: trigger created for form ' + formId);
}
