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
// booking.created only requires identity + calendar fields; phone and unit arrive later via form.
var isBookingCreated = (payload.event || '').trim() === 'booking.created';
var required = isBookingCreated
  ? ['fullName', 'email']
  : ['fullName', 'phoneNumber', 'unitNumber', 'email'];
for (var i = 0; i < required.length; i++) {
  if (!payload[required[i]] || payload[required[i]].trim() === '') {
    return respond(400, { error: 'Missing required field: ' + required[i] });
  }
}

var fullName        = payload.fullName.trim();
var phoneNumber     = (payload.phoneNumber || '').trim();
var unitNumber      = (payload.unitNumber  || '').trim();
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
    htmlBody: 'Hi ' + fullName + ',<br><br>'
      + 'Thanks for scheduling your maintenance appointment with Reliable Storage.<br><br>'
      + 'To help us prepare, please complete this short intake form before your appointment:<br><br>'
      + '<a href="' + formUrl + '">Complete Your Intake Form</a><br><br>'
      + 'This form should take less than a minute and allows our team to understand your request ahead of time.<br><br>'
      + 'If your issue requires immediate assistance (such as a lockout), please call your local office directly instead of using this form.<br><br>'
      + 'If you have any questions, feel free to reply to this email.<br><br>'
      + 'Thank you,<br>Reliable Storage',
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
    htmlBody: 'New booking received.<br><br>'
      +   'Name: '  + fullName    + '<br>'
      +   'Email: ' + email       + '<br>'
      +   'Phone: ' + phoneNumber + '<br>'
      +   'Unit: '  + unitNumber  + '<br><br>'
      + 'Intake form link has been sent to the customer.',
  }
);

// 6. Append booking row to the Bookings sheet.
// bookingSource is the booking page title sent by Pipedream; it maps to Location and Location Group.
// Unmatched or missing values fall back to DEFAULT_LOCATION / DEFAULT_LOCATION_GROUP.
var bookingSource  = (payload.bookingSource || '').trim();
var locationEntry  = CONFIG.LOCATION_MAP[bookingSource] || null;
if (!locationEntry) {
  Logger.log('handlePipedream: bookingSource not matched in LOCATION_MAP ("' + bookingSource + '") — using defaults');
}
var location       = locationEntry ? locationEntry.location      : (CONFIG.DEFAULT_LOCATION       || '');
var locationGroup  = locationEntry ? locationEntry.locationGroup : (CONFIG.DEFAULT_LOCATION_GROUP || '');
// Request Type and Notes are blank here; onFormSubmit will fill them in.
var nameParts = Utils.splitFullName(fullName);
SheetService.appendRow(CONFIG.SPREADSHEET_ID, CONFIG.BOOKINGS_SHEET_NAME, [
  new Date(),                              //  1  Timestamp
  location,                                //  2  Location
  locationGroup,                           //  3  Location Group
  nameParts.firstName,                     //  4  First Name
  nameParts.lastName,                      //  5  Last Name
  phoneNumber,                             //  6  Phone
  email,                                   //  7  Email
  unitNumber,                              //  8  Unit Number
  '',                                      //  9  Request Type  — filled by onFormSubmit
  bookedDate,                              // 10  Booked Date
  bookedTime,                              // 11  Booked Time
  '',                                      // 12  Notes         — filled by onFormSubmit
  'Intake Sent',                           // 13  Status
  'False',                                 // 14  Fee Required
  'False',                                 // 15  Fee Paid
  'False',                                 // 16  Signature Required
  'False',                                 // 17  Signature Complete
  calendarEventId,                         // 18  Calendar Event ID
  '',                                      // 19  Stripe Payment ID
  '',                                      // 20  Docuseal Document ID
  '',                                      // 21  Final Confirmation Sent
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
 * Writes the Stripe session ID, marks Fee Paid, then checks for full completion.
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

  var stripeCol  = found.headers.indexOf('Stripe Payment ID') + 1;
  var feePaidCol = found.headers.indexOf('Fee Paid')          + 1;
  if (stripeCol < 1 || feePaidCol < 1) {
    Logger.log('handleStripeCompleted: required column not found in sheet headers');
    return respond(500, { error: 'Required column not found in sheet' });
  }

  found.sheet.getRange(found.sheetRow, stripeCol).setValue(sessionId);
  found.sheet.getRange(found.sheetRow, feePaidCol).setValue('True');
  Logger.log('handleStripeCompleted: wrote Stripe Payment ID and Fee Paid for ' + email);

  checkAndFinalize(found.sheet, found.sheetRow, found.headers, email);
  return respond(200, { received: true });
}

/**
 * Handles Docuseal submission.completed forwarded by Pipedream.
 * Writes the Docuseal submission ID, marks Signature Complete, then checks for full completion.
 * @param {Object} payload
 * @returns {TextOutput}
 */
function handleDocusealCompleted(payload) {
  var email        = (payload.email                || '').trim();
  var submissionId = (payload.docusealSubmissionId || '').trim();
  if (!email || !submissionId) {
    return respond(400, { error: 'Missing email or docusealSubmissionId' });
  }

  var found = findRowByEmail(email);
  if (!found) {
    return respond(200, { received: true, note: 'No matching booking row' });
  }

  var docusealCol    = found.headers.indexOf('Docuseal Document ID') + 1;
  var sigCompleteCol = found.headers.indexOf('Signature Complete')   + 1;
  if (docusealCol < 1 || sigCompleteCol < 1) {
    Logger.log('handleDocusealCompleted: required column not found in sheet headers');
    return respond(500, { error: 'Required column not found in sheet' });
  }

  found.sheet.getRange(found.sheetRow, docusealCol).setValue(submissionId);
  found.sheet.getRange(found.sheetRow, sigCompleteCol).setValue('True');
  Logger.log('handleDocusealCompleted: wrote Docuseal Document ID and Signature Complete for ' + email);

  checkAndFinalize(found.sheet, found.sheetRow, found.headers, email);
  return respond(200, { received: true });
}

/**
 * Routes a booking row to the correct intermediate or final status based on
 * Fee Paid and Signature Complete flags. Called after each Stripe/Docuseal event.
 *   - Fee Paid only:           Status → "Pending Signature"
 *   - Signature Complete only: Status → "Pending Payment"
 *   - Both complete:           Status → "Confirmed", sends emails, marks Final Confirmation Sent
 * @param {Sheet}    sheet
 * @param {number}   sheetRow  - 1-indexed sheet row
 * @param {string[]} headers
 * @param {string}   email
 */
function checkAndFinalize(sheet, sheetRow, headers, email) {
  // Re-read the row after writes to get current state of all columns.
  var row = sheet.getRange(sheetRow, 1, 1, headers.length).getValues()[0];

  var feePaid           = row[headers.indexOf('Fee Paid')];
  var signatureComplete = row[headers.indexOf('Signature Complete')];
  var feePaidDone   = String(feePaid).trim().toLowerCase() === 'true';
  var signatureDone = String(signatureComplete).trim().toLowerCase() === 'true';
  var statusCol         = headers.indexOf('Status') + 1;
  var status            = row[headers.indexOf('Status')] || '';

  if (status === 'Confirmed') {
    Logger.log('checkAndFinalize: already Confirmed for ' + email + ' — skipping');
    return;
  }

  if (feePaidDone && !signatureDone) {
    sheet.getRange(sheetRow, statusCol).setValue('Pending Signature');
    Logger.log('checkAndFinalize: set Pending Signature for ' + email);
    return;
  }

  if (!feePaidDone && signatureDone) {
    sheet.getRange(sheetRow, statusCol).setValue('Pending Payment');
    Logger.log('checkAndFinalize: set Pending Payment for ' + email);
    return;
  }

  if (!feePaidDone || !signatureDone) {
    Logger.log('checkAndFinalize: not ready to finalize for ' + email
      + ' (feePaid=' + feePaid + ', signatureComplete=' + signatureComplete + ')');
    return;
  }

  // Both complete — finalize.
  sheet.getRange(sheetRow, statusCol).setValue('Confirmed');
  var finalConfCol = headers.indexOf('Final Confirmation Sent') + 1;
  sheet.getRange(sheetRow, finalConfCol).setValue('True');
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
      htmlBody: 'Hi ' + fullName + ',<br><br>'
        + 'Great news — your lock cut appointment is confirmed'
        + (bookedDate || bookedTime
            ? ' for '
              + (bookedDate ? bookedDate : '')
              + (bookedTime ? ' at ' + bookedTime : '')
            : '')
        + '.<br><br>'
        + 'Our team will be ready at your unit'
        + (unitNumber ? ' (' + unitNumber + ')' : '')
        + '.<br><br>'
        + 'If you have any questions, reply to this email.<br><br>'
        + 'Thank you,<br>Reliable Storage',
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
      + 'Time: '         + bookedTime  + '\n',
    {
      htmlBody: 'Lock cut appointment confirmed.<br><br>'
        +   'Name: '         + fullName    + '<br>'
        +   'Email: '        + email       + '<br>'
        +   'Phone: '        + phoneNumber + '<br>'
        +   'Unit: '         + unitNumber  + '<br>'
        +   'Request Type: ' + requestType + '<br><br>'
        +   'Date: ' + bookedDate + '<br>'
        +   'Time: ' + bookedTime,
    }
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
