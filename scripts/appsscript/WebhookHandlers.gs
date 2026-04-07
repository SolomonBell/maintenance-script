/**
 * WebhookHandlers.gs
 * Routes incoming POST webhook payloads to the correct service handler.
 * Called from doPost() in Code.gs.
 */

var WebhookHandlers = (function () {

  /**
   * Main router. Inspects the request and delegates to the right handler.
   * @param {Object} e - The doPost event object.
   * @returns {TextOutput}
   */
  function route(e) {
    try {
      var source = e.parameter.source || detectSource(e);
      var payload = JSON.parse(e.postData.contents);

      switch (source) {
        case 'stripe':
          return handleStripe(payload);
        case 'docuseal':
          return handleDocuseal(payload);
        default:
          return respond(400, { error: 'Unknown webhook source: ' + source });
      }
    } catch (err) {
      Logger.log('WebhookHandlers.route error: ' + err.message);
      return respond(500, { error: err.message });
    }
  }

  function handleStripe(payload) {
    Logger.log('Stripe event: ' + payload.type);
    // TODO: handle specific event types (e.g. payment_intent.succeeded)
    return respond(200, { received: true });
  }

  function handleDocuseal(payload) {
    Logger.log('Docuseal event: ' + payload.event_type);
    // TODO: handle submission.completed, etc.
    return respond(200, { received: true });
  }

  /**
   * Attempt to detect the webhook source from request headers or body.
   * @param {Object} e
   * @returns {string}
   */
  function detectSource(e) {
    var headers = e.parameter || {};
    if (headers['Stripe-Signature']) return 'stripe';
    // Add other detection logic as needed
    return 'unknown';
  }

  function respond(status, data) {
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }

  return { route: route };
})();
