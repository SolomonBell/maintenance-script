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

    // Send a confirmation email for non-lock-cut requests only.
    // Lock-cut bookings require payment + signature first (Phase 2 paths 3–4).
    var isLockCut = requestType.toLowerCase().indexOf('lock') !== -1;
    if (!isLockCut) {
      var row         = data[targetRowIndex];
      var firstName   = row[headers.indexOf('First Name')]  || '';
      var lastName    = row[headers.indexOf('Last Name')]   || '';
      var phoneNumber = row[headers.indexOf('Phone')]       || '';
      var bookedDateRaw = row[headers.indexOf('Booked Date')];
      var bookedTimeRaw = row[headers.indexOf('Booked Time')];
      var tz          = Session.getScriptTimeZone();
      var bookedDate  = (bookedDateRaw instanceof Date)
        ? Utilities.formatDate(bookedDateRaw, tz, 'MMM d, yyyy')
        : (bookedDateRaw || '');
      var bookedTime  = (bookedTimeRaw instanceof Date)
        ? Utilities.formatDate(bookedTimeRaw, tz, 'h:mm a')
        : (bookedTimeRaw || '');
      var unitNumber  = row[headers.indexOf('Unit Number')] || '';
      var fullName    = (firstName + ' ' + lastName).trim();

      EmailService.send(
        email,
        'Your maintenance request is confirmed',
        'Hi ' + fullName + ',\n\n'
          + 'Your maintenance request has been confirmed'
          + (bookedDate ? ' for ' + bookedDate : '')
          + (bookedTime ? ' at ' + bookedTime : '')
          + '.\n\n'
          + 'Our team will be ready at your unit'
          + (unitNumber ? ' (' + unitNumber + ')' : '')
          + '.\n\n'
          + 'If you need to make changes or have questions, reply to this email.\n\n'
          + 'Thank you,\n'
          + 'Reliable Storage',
        {
          htmlBody: '<p>Hi ' + fullName + ',</p>'
            + '<p>Your maintenance request has been confirmed'
            + (bookedDate || bookedTime
                ? ' for '
                  + (bookedDate ? bookedDate : '')
                  + (bookedTime ? ' at ' + bookedTime : '')
                : '')
            + '.</p>'
            + '<p>Our team will be ready at your unit'
            + (unitNumber ? ' (' + unitNumber + ')' : '')
            + '.</p>'
            + '<p>If you need to make changes or have questions, reply to this email.</p>'
            + '<p>Thank you,<br>Reliable Storage</p>',
        }
      );
      Logger.log('onSubmit: confirmation sent to ' + email);

      // Notify the site manager that a non-lock-cut request has been confirmed.
      EmailService.notify(
        'Confirmed maintenance request: ' + fullName + ' — Unit ' + unitNumber,
        'A maintenance request has been confirmed.\n\n'
          + 'Name: '         + fullName    + '\n'
          + 'Email: '        + email       + '\n'
          + 'Phone: '        + phoneNumber + '\n'
          + 'Unit: '         + unitNumber  + '\n'
          + 'Request Type: ' + requestType + '\n'
          + 'Date: '         + bookedDate  + '\n'
          + 'Time: '         + bookedTime  + '\n'
          + (notes ? 'Notes: ' + notes + '\n' : ''),
        {
          htmlBody: '<p>A maintenance request has been confirmed.</p>'
            + '<p>'
            +   'Name: '         + fullName    + '<br>'
            +   'Email: '        + email       + '<br>'
            +   'Phone: '        + phoneNumber + '<br>'
            +   'Unit: '         + unitNumber  + '<br>'
            +   'Request Type: ' + requestType + '<br>'
            +   'Date: '         + bookedDate  + '<br>'
            +   'Time: '         + bookedTime
            + (notes ? '<br>Notes: ' + notes : '')
            + '</p>',
        }
      );
      Logger.log('onSubmit: manager notification sent for ' + email);

    } else {
      // Lock-cut path — payment required now; signature link follows separately.
      var lcRow             = data[targetRowIndex];
      var lcFirstName       = lcRow[headers.indexOf('First Name')]        || '';
      var lcLastName        = lcRow[headers.indexOf('Last Name')]         || '';
      var lcUnitNumber      = lcRow[headers.indexOf('Unit Number')]       || '';
      var lcCalendarEventId = lcRow[headers.indexOf('Calendar Event ID')] || '';
      var lcFullName        = (lcFirstName + ' ' + lcLastName).trim();

      // Create a Stripe Checkout Session for the $50 lock cut fee.
      var session = StripeService.createCheckoutSession(
        email,
        lcFullName,
        {
          bookingEmail:    email,
          unitNumber:      lcUnitNumber,
          requestType:     requestType,
          calendarEventId: lcCalendarEventId,
        }
      );
      var paymentUrl = session.url;

      // Create a Docuseal submission for the lock cut release authorization form.
      var docusealResult = DocusealService.createSubmission(
        CONFIG.DOCUSEAL_TEMPLATE_ID,
        [{ email: email, role: 'First Party' }]
      );
      // Docuseal returns an array of submitter objects directly.
      if (!Array.isArray(docusealResult) || !docusealResult[0] || !docusealResult[0].embed_src) {
        throw new Error('DocusealService.createSubmission returned unexpected response: ' + JSON.stringify(docusealResult));
      }
      var signingUrl = docusealResult[0].embed_src;

      // Overwrite the status set above — lock-cut rows need a distinct state.
      sheet.getRange(sheetRow, 11).setValue('Pending Payment + Signature');

      EmailService.send(
        email,
        'Action required: complete payment and signature for your lock cut',
        'Hi ' + lcFullName + ',\n\n'
          + 'Thank you for submitting your maintenance request'
          + (lcUnitNumber ? ' for unit ' + lcUnitNumber : '')
          + '.\n\n'
          + 'Before we can confirm your appointment, please complete both steps below:\n\n'
          + '  1. Pay the $50 lock cut fee:\n'
          + '     ' + paymentUrl + '\n\n'
          + '  2. Sign the release authorization form:\n'
          + '     ' + signingUrl + '\n\n'
          + 'Your appointment will be confirmed once both steps are complete.\n\n'
          + 'If you have questions, reply to this email.\n\n'
          + 'Thank you,\n'
          + 'Reliable Storage',
        {
          htmlBody: '<p>Hi ' + lcFullName + ',</p>'
            + '<p>Thank you for submitting your maintenance request'
            + (lcUnitNumber ? ' for unit ' + lcUnitNumber : '')
            + '.</p>'
            + '<p>Before we can confirm your appointment, please complete both steps below:</p>'
            + '<ol>'
            +   '<li>Pay the $50 lock cut fee<br>'
            +     '<a href="' + paymentUrl + '">Complete payment now</a></li>'
            +   '<li>Sign the release authorization form<br>'
            +     '<a href="' + signingUrl + '">Sign the release form</a></li>'
            + '</ol>'
            + '<p>Your appointment will be confirmed once both steps are complete.</p>'
            + '<p>If you have questions, reply to this email.</p>'
            + '<p>Thank you,<br>Reliable Storage</p>',
        }
      );
      Logger.log('onSubmit: lock-cut email sent to ' + email + ' — session ' + session.id + ', docuseal submitter ' + docusealResult[0].email);
    }
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
      + CONFIG.INTAKE_FORM_PUBLIC_ID
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
