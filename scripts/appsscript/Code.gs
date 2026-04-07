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
