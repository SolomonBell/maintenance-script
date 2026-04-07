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
* secret           {string} - Must match CONFIG.PIPEDREAM_SECRET.
* event            {string} - Event type, e.g. "booking.created" (logged only).
* fullName         {string} - Customer's full name.
* phoneNumber      {string} - Customer's phone number.
* unitNumber       {string} - Unit/apartment number.
* email            {string} - Customer's email address.
* issueDescription {string} - Optional. Pre-fills the Issue Description form field.
*
* @param {Object} payload - Parsed JSON body from doPost.
* @returns {TextOutput}
  */
  function handlePipedream(payload) {
  // 1. Authenticate — reject immediately if secret is missing or wrong.
  // Trim both sides to guard against whitespace in Script Properties or env vars.
  var incomingSecret = (payload.secret || '').trim();
  var expectedSecret = (CONFIG.PIPEDREAM_SECRET || '').trim();
  if (!incomingSecret || incomingSecret !== expectedSecret) {
  return respond(401, { error: 'Unauthorized' });
  }

// 2. Validate required booking fields.

var required = ['fullName', 'phoneNumber', 'unitNumber', 'email'];
for (var i = 0; i < required.length; i++) {
  if (!payload[required[i]] || payload[required[i]].trim() === '') {
    return respond(400, { error: 'Missing required field: ' + required[i] });
  }
}

var fullName = payload.fullName.trim();
var phoneNumber = payload.phoneNumber.trim();
var unitNumber = payload.unitNumber.trim();
var email = payload.email.trim();
var issueDescription = (payload.issueDescription || '').trim();

Logger.log('handlePipedream: event=' + (payload.event || 'unspecified') + ' email=' + email);

// 3. Build the pre-filled intake form URL.
var formUrl = FormHandlers.buildPrefilledUrl(fullName, phoneNumber, unitNumber, issueDescription);

// 4. Send the email to the customer.
EmailService.send(
  email,
  'Action Required: Complete Your Maintenance Intake Form',
  'Hi ' + fullName + ',\n\n'
    + 'Thanks for scheduling your maintenance appointment with Reliable Storage.\n\n'
    + 'To help us prepare, please complete this short intake form before your appointment:\n\n'
    + formUrl + '\n\n'
    + 'This form should take less than a minute and allows our team to understand your request ahead of time.\n\n'
    + 'If your issue requires immediate assistance (such as a lockout), please call your local office directly instead of using this form.\n\n'
    + 'If you have any questions, feel free to reply to this email.\n\n'
    + 'Thank you,\n'
    + 'Reliable Storage',
  {
    htmlBody: '<p>Hi ' + fullName + ',</p>'
      + '<p>Thanks for scheduling your maintenance appointment with Reliable Storage.</p>'
      + '<p>To help us prepare, please complete this short intake form before your appointment:</p>'
      + '<p><a href="' + formUrl + '">Complete Your Intake Form</a></p>'
      + '<p>This form should take less than a minute and allows our team to understand your request ahead of time.</p>'
      + '<p>If your issue requires immediate assistance (such as a lockout), please call your local office directly instead of using this form.</p>'
      + '<p>If you have any questions, feel free to reply to this email.</p>'
      + '<p>Thank you,<br>Reliable Storage</p>',
  }
);

// 5. Send internal notification.
EmailService.notify(
  'New booking: ' + fullName + ' — Unit ' + unitNumber,
  'New booking received.\n\n'
    + 'Name:    ' + fullName + '\n'
    + 'Email:   ' + email + '\n'
    + 'Phone:   ' + phoneNumber + '\n'
    + 'Unit:    ' + unitNumber + '\n'
    + (issueDescription ? 'Issue:   ' + issueDescription + '\n' : '')
    + '\nIntake form link sent to customer.'
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
