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
        case 'pipedream':
          return handlePipedream(payload);
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
   * Handles booking payloads sent by Pipedream.
   *
   * Expected payload fields:
   *   secret      {string} - Must match CONFIG.PIPEDREAM_SECRET.
   *   event       {string} - Event type, e.g. "booking.created" (logged only).
   *   fullName    {string} - Customer's full name.
   *   phoneNumber {string} - Customer's phone number.
   *   unitNumber  {string} - Unit/apartment number.
   *   email       {string} - Customer's email address.
   *
   * @param {Object} payload - Parsed JSON body from doPost.
   * @returns {TextOutput}
   */
  function handlePipedream(payload) {
    // 1. Authenticate — reject immediately if secret is missing or wrong.
    if (!payload.secret || payload.secret !== CONFIG.PIPEDREAM_SECRET) {
      return respond(401, { error: 'Unauthorized' });
    }

    // 2. Validate required booking fields.
    var required = ['fullName', 'phoneNumber', 'unitNumber', 'email'];
    for (var i = 0; i < required.length; i++) {
      if (!payload[required[i]] || payload[required[i]].trim() === '') {
        return respond(400, { error: 'Missing required field: ' + required[i] });
      }
    }

    var fullName    = payload.fullName.trim();
    var phoneNumber = payload.phoneNumber.trim();
    var unitNumber  = payload.unitNumber.trim();
    var email       = payload.email.trim();

    Logger.log('handlePipedream: event=' + (payload.event || 'unspecified') + ' email=' + email);

    // 3. Build the pre-filled intake form URL.
    var formUrl = FormHandlers.buildPrefilledUrl(fullName, phoneNumber, unitNumber);

    // 4. Send the email to the customer.
    EmailService.send(
      email,
      'Complete your intake form — ' + fullName,
      'Hi ' + fullName + ',\n\n'
        + 'Please complete your intake form before your appointment:\n\n'
        + formUrl + '\n\n'
        + 'Reply to this email if you have any questions.'
    );

    return respond(200, { received: true, email: email });
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
