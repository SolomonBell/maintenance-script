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
  var source = (e.parameter && e.parameter.source) || detectSource(e);
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
// Direct Stripe webhook — not yet implemented (events arrive via Pipedream instead).
return respond(200, { received: true });
}

function handleDocuseal(payload) {
Logger.log('Docuseal event: ' + payload.event_type);
// Direct Docuseal webhook — not yet implemented (events arrive via Pipedream instead).
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

// 2. Route completion events before booking-creation logic.
if (payload.eventType === 'stripe_checkout_completed') {
  return handleStripeCompleted(payload);
}
if (payload.eventType === 'docuseal_submission_completed') {
  return handleDocusealCompleted(payload);
}

// 3. Validate required booking fields.

var required = ['fullName', 'phoneNumber', 'unitNumber', 'email'];
for (var i = 0; i < required.length; i++) {
  if (!payload[required[i]] || payload[required[i]].trim() === '') {
    return respond(400, { error: 'Missing required field: ' + required[i] });
  }
}

var fullName        = payload.fullName.trim();
var phoneNumber     = payload.phoneNumber.trim();
var unitNumber      = payload.unitNumber.trim();
var email           = payload.email.trim();
var bookedDate      = (payload.bookedDate      || '').trim();
var bookedTime      = (payload.bookedTime      || '').trim();
var calendarEventId = (payload.calendarEventId || '').trim();

Logger.log('handlePipedream: event=' + (payload.event || 'unspecified') + ' email=' + email + ' calendarEventId=' + calendarEventId);

// 3. Build the pre-filled intake form URL.
var formUrl = FormHandlers.buildPrefilledUrl(fullName, phoneNumber, unitNumber, email);

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
    + 'Name: '  + fullName    + '\n'
    + 'Email: ' + email       + '\n'
    + 'Phone: ' + phoneNumber + '\n'
    + 'Unit: '  + unitNumber  + '\n'
    + '\nIntake form link has been sent to the customer.',
  {
    htmlBody: '<p><strong>New booking received.</strong></p>'
      + '<p>'
      +   'Name: '  + fullName    + '<br>'
      +   'Email: ' + email       + '<br>'
      +   'Phone: ' + phoneNumber + '<br>'
      +   'Unit: '  + unitNumber  + '<br>'
      + '</p>'
      + '<p>Intake form link has been sent to the customer.</p>',
  }
);

// 6. Append booking row to the Bookings sheet (Phase 1 — incomplete row).
// Request Type, Notes are blank here; onFormSubmit will fill them in.
var nameParts = Utils.splitFullName(fullName);
SheetService.appendRow(CONFIG.SPREADSHEET_ID, CONFIG.BOOKINGS_SHEET_NAME, [
  new Date(),          // Timestamp
  nameParts.firstName, // First Name
  nameParts.lastName,  // Last Name
  phoneNumber,         // Phone
  email,               // Email
  unitNumber,          // Unit Number
  '',                  // Request Type  — filled by onFormSubmit
  bookedDate,          // Booked Date
  bookedTime,          // Booked Time
  '',                  // Notes         — filled by onFormSubmit
  'Intake Sent',       // Status
  calendarEventId,     // Calendar Event ID
  '',                  // Stripe Payment ID      — future
  '',                  // Docuseal Document ID   — future
  'TRUE',              // Confirmation Sent
]);
Logger.log('handlePipedream: booking row appended for ' + email);

return respond(200, { received: true, email: email });

}

/**
 * Finds the most recent booking row matching an email address.
 * Returns { sheet, headers, sheetRow, row } or null if not found.
 * @param {string} email
 * @returns {Object|null}
 */
function findRowByEmail(email) {
  var sheet = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID)
    .getSheetByName(CONFIG.BOOKINGS_SHEET_NAME);
  if (!sheet) {
    Logger.log('findRowByEmail: sheet not found');
    return null;
  }
  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var emailCol = headers.indexOf('Email');
  if (emailCol === -1) {
    Logger.log('findRowByEmail: Email column not found');
    return null;
  }
  for (var i = data.length - 1; i >= 1; i--) {
    if ((data[i][emailCol] || '').trim().toLowerCase() === email.toLowerCase()) {
      return { sheet: sheet, headers: headers, sheetRow: i + 1 };
    }
  }
  Logger.log('findRowByEmail: no row found for ' + email);
  return null;
}

/**
 * Handles Stripe checkout.session.completed forwarded by Pipedream.
 * Writes the Stripe session ID to the booking row, then checks for completion.
 * @param {Object} payload
 * @returns {TextOutput}
 */
function handleStripeCompleted(payload) {
  var email     = (payload.email           || '').trim();
  var sessionId = (payload.stripeSessionId || '').trim();
  if (!email || !sessionId) {
    return respond(400, { error: 'Missing email or stripeSessionId' });
  }

  var found = findRowByEmail(email);
  if (!found) {
    return respond(200, { received: true, note: 'No matching booking row' });
  }

  var col = found.headers.indexOf('Stripe Payment ID') + 1;
  if (col < 1) {
    Logger.log('handleStripeCompleted: Stripe Payment ID column not found');
    return respond(500, { error: 'Stripe Payment ID column not found in sheet' });
  }

  found.sheet.getRange(found.sheetRow, col).setValue(sessionId);
  Logger.log('handleStripeCompleted: wrote Stripe Payment ID for ' + email);

  checkAndFinalize(found.sheet, found.sheetRow, found.headers, email);
  return respond(200, { received: true });
}

/**
 * Handles Docuseal submission.completed forwarded by Pipedream.
 * Writes the Docuseal submission ID to the booking row, then checks for completion.
 * @param {Object} payload
 * @returns {TextOutput}
 */
function handleDocusealCompleted(payload) {
  var email          = (payload.email                 || '').trim();
  var submissionId   = (payload.docusealSubmissionId  || '').trim();
  if (!email || !submissionId) {
    return respond(400, { error: 'Missing email or docusealSubmissionId' });
  }

  var found = findRowByEmail(email);
  if (!found) {
    return respond(200, { received: true, note: 'No matching booking row' });
  }

  var col = found.headers.indexOf('Docuseal Document ID') + 1;
  if (col < 1) {
    Logger.log('handleDocusealCompleted: Docuseal Document ID column not found');
    return respond(500, { error: 'Docuseal Document ID column not found in sheet' });
  }

  found.sheet.getRange(found.sheetRow, col).setValue(submissionId);
  Logger.log('handleDocusealCompleted: wrote Docuseal Document ID for ' + email);

  checkAndFinalize(found.sheet, found.sheetRow, found.headers, email);
  return respond(200, { received: true });
}

/**
 * Checks whether both Stripe and Docuseal steps are complete for a booking row.
 * If both IDs are present and status is not already Confirmed, finalizes the booking:
 * updates status, sends customer confirmation email, and notifies the manager.
 * @param {Sheet}    sheet
 * @param {number}   sheetRow  - 1-indexed sheet row
 * @param {string[]} headers
 * @param {string}   email
 */
function checkAndFinalize(sheet, sheetRow, headers, email) {
  // Re-read the row after writes to get current state of all columns.
  var row = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];

  var stripeId   = row[headers.indexOf('Stripe Payment ID')]   || '';
  var docusealId = row[headers.indexOf('Docuseal Document ID')] || '';
  var statusCol  = headers.indexOf('Status') + 1;
  var status     = row[headers.indexOf('Status')]               || '';

  if (!stripeId || !docusealId) {
    Logger.log('checkAndFinalize: incomplete for ' + email
      + ' (stripe=' + !!stripeId + ', docuseal=' + !!docusealId + ')');
    return;
  }

  if (status === 'Confirmed') {
    Logger.log('checkAndFinalize: already Confirmed for ' + email + ' — skipping');
    return;
  }

  sheet.getRange(sheetRow, statusCol).setValue('Confirmed');
  Logger.log('checkAndFinalize: set Confirmed for ' + email);

  var firstName   = row[headers.indexOf('First Name')]  || '';
  var lastName    = row[headers.indexOf('Last Name')]   || '';
  var phoneNumber = row[headers.indexOf('Phone')]       || '';
  var unitNumber  = row[headers.indexOf('Unit Number')] || '';
  var bookedDateRaw = row[headers.indexOf('Booked Date')];
  var bookedTimeRaw = row[headers.indexOf('Booked Time')];
  var tz = Session.getScriptTimeZone();
  var bookedDate = (bookedDateRaw instanceof Date)
    ? Utilities.formatDate(bookedDateRaw, tz, 'MMM d, yyyy')
    : (bookedDateRaw || '');
  var bookedTime = (bookedTimeRaw instanceof Date)
    ? Utilities.formatDate(bookedTimeRaw, tz, 'h:mm a')
    : (bookedTimeRaw || '');
  var requestType = row[headers.indexOf('Request Type')] || '';
  var fullName    = (firstName + ' ' + lastName).trim();

  EmailService.send(
    email,
    'Your lock cut appointment is confirmed',
    'Hi ' + fullName + ',\n\n'
      + 'Great news — your lock cut appointment is confirmed'
      + (bookedDate ? ' for ' + bookedDate : '')
      + (bookedTime ? ' at ' + bookedTime : '')
      + '.\n\n'
      + 'Our team will be ready at your unit'
      + (unitNumber ? ' (' + unitNumber + ')' : '')
      + '.\n\n'
      + 'If you have any questions, reply to this email.\n\n'
      + 'Thank you,\n'
      + 'Reliable Storage',
    {
      htmlBody: '<p>Hi ' + fullName + ',</p>'
        + '<p>Great news — your lock cut appointment is confirmed'
        + (bookedDate || bookedTime
            ? ' for <strong>'
              + (bookedDate ? bookedDate : '')
              + (bookedTime ? ' at ' + bookedTime : '')
              + '</strong>'
            : '')
        + '.</p>'
        + '<p>Our team will be ready at your unit'
        + (unitNumber ? ' (<strong>' + unitNumber + '</strong>)' : '')
        + '.</p>'
        + '<p>If you have any questions, reply to this email.</p>'
        + '<p>Thank you,<br>Reliable Storage</p>',
    }
  );
  Logger.log('checkAndFinalize: confirmation email sent to ' + email);

  EmailService.notify(
    'Lock cut confirmed: ' + fullName + ' — Unit ' + unitNumber,
    'Lock cut appointment confirmed.\n\n'
      + 'Name: '         + fullName    + '\n'
      + 'Email: '        + email       + '\n'
      + 'Phone: '        + phoneNumber + '\n'
      + 'Unit: '         + unitNumber  + '\n'
      + 'Request Type: ' + requestType + '\n\n'
      + 'Date: '         + bookedDate  + '\n'
      + 'Time: '         + bookedTime  + '\n'
  );
  Logger.log('checkAndFinalize: manager notification sent for ' + email);
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
