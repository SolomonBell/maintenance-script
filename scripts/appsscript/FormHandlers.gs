/**
 * FormHandlers.gs
 * Handles Google Form submission events (onFormSubmit trigger).
 */

var FormHandlers = (function () {

  /**
   * onFormSubmit trigger handler — Phase 2 of the booking flow.
   *
   * Finds the booking row in the Bookings sheet by email address and updates
   * Request Type, Notes, status flags, and fee/signature metadata.
   * Wire this to an installable onFormSubmit trigger in the Apps Script editor.
   *
   * @param {Object} e - The form submit event object.
   */
  function onSubmit(e) {
    var responses = parseResponses(e.response);
    Logger.log('Form submitted: ' + JSON.stringify(responses));

    var email       = (responses['Email Address'] || '').trim();
    var location    = (responses['Location']      || '').trim();
    var requestType = (responses['Request Type']  || '').trim();
    var notes       = (responses['Notes']         || '').trim();
    var phoneNumber = (responses['Phone Number']  || '').trim();
    var unitNumber  = (responses['Unit Number']   || '').trim();

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

    // Derive column positions from headers — avoids fragile hardcoded indices.
    var locationCol    = headers.indexOf('Location')                + 1;
    var requestTypeCol = headers.indexOf('Request Type')            + 1;
    var notesCol       = headers.indexOf('Notes')                   + 1;
    var statusCol      = headers.indexOf('Status')                  + 1;
    var feeReqCol      = headers.indexOf('Fee Required')            + 1;
    var sigReqCol      = headers.indexOf('Signature Required')      + 1;
    var finalConfCol   = headers.indexOf('Final Confirmation Sent') + 1;
    var phoneCol       = headers.indexOf('Phone')                   + 1;
    var unitNumberCol  = headers.indexOf('Unit Number')             + 1;

    sheet.getRange(sheetRow, locationCol).setValue(location);
    sheet.getRange(sheetRow, requestTypeCol).setValue(requestType);
    sheet.getRange(sheetRow, notesCol).setValue(notes);
    sheet.getRange(sheetRow, phoneCol).setValue(phoneNumber);
    sheet.getRange(sheetRow, unitNumberCol).setValue(unitNumber);
    sheet.getRange(sheetRow, statusCol).setValue('Form Submitted');

    Logger.log('onSubmit: updated row ' + sheetRow + ' for email ' + email);

    // Send a confirmation email for non-lock-cut requests only.
    // Lock-cut bookings require payment + signature first.
    var isLockCut = requestType.toLowerCase().indexOf('lock') !== -1;
    if (!isLockCut) {
      var row           = data[targetRowIndex];
      var firstName     = row[headers.indexOf('First Name')]     || '';
      var lastName      = row[headers.indexOf('Last Name')]      || '';
      var locationGroup = row[headers.indexOf('Location Group')] || '';
      var location      = row[headers.indexOf('Location')]       || '';
      var bookedDateRaw = row[headers.indexOf('Booked Date')];
      var bookedTimeRaw = row[headers.indexOf('Booked Time')];
      var tz            = Session.getScriptTimeZone();
      var bookedDate    = (bookedDateRaw instanceof Date)
        ? Utilities.formatDate(bookedDateRaw, tz, 'MMM d, yyyy')
        : (bookedDateRaw || '');
      var bookedTime    = (bookedTimeRaw instanceof Date)
        ? Utilities.formatDate(bookedTimeRaw, tz, 'h:mm a')
        : (bookedTimeRaw || '');
      var fullName      = (firstName + ' ' + lastName).trim();

      EmailService.send(
        email,
        (location ? location + ' ' : '') + fullName + ' Confirmed',
        'Hi ' + fullName + ',\n\n'
          + 'Your maintenance request'
          + (location ? ' at ' + location : '')
          + ' has been confirmed'
          + (bookedDate ? ' for ' + bookedDate : '')
          + (bookedTime ? ' at ' + bookedTime : '')
          + '.\n\n'
          + 'Our team will be ready at your unit'
          + (unitNumber ? ' (' + unitNumber + ')' : '')
          + '. No further action is required on your end.\n\n'
          + 'If you need to make changes or have questions, reply to this email.\n\n'
          + 'Thank you,\n'
          + 'Reliable Storage',
        {
          htmlBody: 'Hi ' + fullName + ',<br><br>'
            + 'Your maintenance request'
            + (location ? ' at ' + location : '')
            + ' has been confirmed'
            + (bookedDate || bookedTime
                ? ' for '
                  + (bookedDate ? bookedDate : '')
                  + (bookedTime ? ' at ' + bookedTime : '')
                : '')
            + '.<br><br>'
            + 'Our team will be ready at your unit'
            + (unitNumber ? ' (' + unitNumber + ')' : '')
            + '. No further action is required on your end.<br><br>'
            + 'If you need to make changes or have questions, reply to this email.<br><br>'
            + 'Thank you,<br>Reliable Storage',
        }
      );
      Logger.log('onSubmit: confirmation sent to ' + email);

      // Notify the site manager that a non-lock-cut request has been confirmed.
      EmailService.notify(
        (location || 'Unknown Location') + ' ' + fullName + ' Confirmed',
        'Maintenance request confirmed.\n\n'
          + 'Name: '           + fullName      + '\n'
          + 'Email: '          + email         + '\n'
          + 'Phone: '          + phoneNumber   + '\n'
          + 'Unit: '           + unitNumber    + '\n'
          + 'Location: '       + location      + '\n'
          + 'Location Group: ' + locationGroup + '\n\n'
          + 'Request Type: '   + requestType   + '\n'
          + (bookedDate || bookedTime
              ? 'Date/Time: ' + (bookedDate || '') + (bookedTime ? ' at ' + bookedTime : '') + '\n'
              : '')
          + 'Fee Required: False\n'
          + 'Signature Required: False\n'
          + (notes ? '\nNotes: ' + notes + '\n' : '')
          + '\nStatus: Confirmed',
        {
          htmlBody: 'Maintenance request confirmed.<br><br>'
            +   'Name: '           + fullName      + '<br>'
            +   'Email: '          + email         + '<br>'
            +   'Phone: '          + phoneNumber   + '<br>'
            +   'Unit: '           + unitNumber    + '<br>'
            +   'Location: '       + location      + '<br>'
            +   'Location Group: ' + locationGroup + '<br><br>'
            +   'Request Type: '   + requestType   + '<br>'
            +   (bookedDate || bookedTime
                  ? 'Date/Time: ' + (bookedDate || '') + (bookedTime ? ' at ' + bookedTime : '') + '<br>'
                  : '')
            +   'Fee Required: False<br>'
            +   'Signature Required: False<br>'
            +   (notes ? '<br>Notes: ' + notes + '<br>' : '')
            +   '<br>Status: Confirmed',
        }
      );
      Logger.log('onSubmit: manager notification sent for ' + email);

      // Confirmation emails sent — mark the booking as fully resolved.
      sheet.getRange(sheetRow, statusCol).setValue('Confirmed');
      sheet.getRange(sheetRow, finalConfCol).setValue('True');
      Logger.log('onSubmit: set Confirmed and Final Confirmation Sent for ' + email);

    } else {
      // Lock-cut path — fee and signature required before confirming.
      var lcRow             = data[targetRowIndex];
      var lcFirstName       = lcRow[headers.indexOf('First Name')]        || '';
      var lcLastName        = lcRow[headers.indexOf('Last Name')]         || '';
      var lcCalendarEventId = lcRow[headers.indexOf('Calendar Event ID')] || '';
      var lcLocationGroup   = lcRow[headers.indexOf('Location Group')]    || '';
      var lcLocation        = lcRow[headers.indexOf('Location')]           || '';
      var lcFullName        = (lcFirstName + ' ' + lcLastName).trim();

      // Create a Stripe Checkout Session for the $50 lock cut fee.
      var session = StripeService.createCheckoutSession(
        email,
        lcFullName,
        {
          bookingEmail:    email,
          unitNumber:      unitNumber,
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

      // Mark fee and signature as required, overwrite status to reflect pending state.
      sheet.getRange(sheetRow, feeReqCol).setValue('True');
      sheet.getRange(sheetRow, sigReqCol).setValue('True');
      sheet.getRange(sheetRow, statusCol).setValue('Pending Payment + Signature');

      EmailService.send(
        email,
        (lcLocation ? lcLocation + ' ' : '') + lcFullName + ' Action Required',
        'Hi ' + lcFullName + ',\n\n'
          + 'Thank you for submitting your maintenance request'
          + (lcLocation ? ' at ' + lcLocation : '')
          + (unitNumber ? ' for unit ' + unitNumber : '')
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
          htmlBody: 'Hi ' + lcFullName + ',<br><br>'
            + 'Thank you for submitting your maintenance request'
            + (lcLocation ? ' at ' + lcLocation : '')
            + (unitNumber ? ' for unit ' + unitNumber : '')
            + '.<br><br>'
            + 'Before we can confirm your appointment, please complete both steps below:<br><br>'
            + '1. Pay the $50 lock cut fee<br>'
            +   '<a href="' + paymentUrl + '">Complete payment now</a><br><br>'
            + '2. Sign the release authorization form<br>'
            +   '<a href="' + signingUrl + '">Sign the release form</a><br><br>'
            + 'Your appointment will be confirmed once both steps are complete.<br><br>'
            + 'If you have questions, reply to this email.<br><br>'
            + 'Thank you,<br>Reliable Storage',
        }
      );
      Logger.log('onSubmit: lock-cut email sent to ' + email + ' — session ' + session.id + ', docuseal submitter ' + docusealResult[0].email);

      // Notify the site manager that payment and signature links were sent.
      EmailService.notify(
        (lcLocation || 'Unknown Location') + ' ' + lcFullName + ' Pending',
        'Lock cut request received. Payment and signature links sent to customer.\n\n'
          + 'Name: '               + lcFullName      + '\n'
          + 'Email: '              + email           + '\n'
          + 'Phone: '              + phoneNumber     + '\n'
          + 'Unit: '               + unitNumber      + '\n'
          + 'Location: '           + lcLocation       + '\n'
          + 'Location Group: '     + lcLocationGroup + '\n\n'
          + 'Request Type: '       + requestType     + '\n'
          + (notes ? 'Notes: ' + notes + '\n\n' : '\n')
          + 'Fee Required: True\n'
          + 'Fee Paid: False\n'
          + 'Signature Required: True\n'
          + 'Signature Complete: False\n\n'
          + 'Status: Pending Payment + Signature',
        {
          htmlBody: 'Lock cut request received. Payment and signature links sent to customer.<br><br>'
            +   'Name: '               + lcFullName      + '<br>'
            +   'Email: '              + email           + '<br>'
            +   'Phone: '              + phoneNumber     + '<br>'
            +   'Unit: '               + unitNumber      + '<br>'
            +   'Location: '           + lcLocation       + '<br>'
            +   'Location Group: '     + lcLocationGroup + '<br><br>'
            +   'Request Type: '       + requestType     + '<br>'
            +   (notes ? 'Notes: ' + notes + '<br><br>' : '<br>')
            +   'Fee Required: True<br>'
            +   'Fee Paid: False<br>'
            +   'Signature Required: True<br>'
            +   'Signature Complete: False<br><br>'
            +   'Status: Pending Payment + Signature',
        }
      );
      Logger.log('onSubmit: lock-cut manager notification sent for ' + email);
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
  function buildPrefilledUrl(fullName, phoneNumber, unitNumber, email, locationPrefill) {
    // fullName and email are always required; phoneNumber and unitNumber are
    // optional at booking.created time and collected later via the form.
    if (Utils.isEmpty(fullName)) throw new Error('buildPrefilledUrl: fullName is required');
    if (Utils.isEmpty(email))    throw new Error('buildPrefilledUrl: email is required');

    var base = 'https://docs.google.com/forms/d/e/'
      + CONFIG.INTAKE_FORM_PUBLIC_ID
      + '/viewform?usp=pp_url';

    var fields = CONFIG.INTAKE_FORM_FIELDS;

    // encodeURIComponent handles spaces, ampersands, slashes, and other
    // characters that would otherwise break the query string.
    var params = [
      fields.FULL_NAME + '=' + encodeURIComponent(fullName),
      fields.EMAIL     + '=' + encodeURIComponent(email),
    ];

    // Only pre-fill optional fields when values are available.
    if (!Utils.isEmpty(phoneNumber)) {
      params.push(fields.PHONE_NUMBER + '=' + encodeURIComponent(phoneNumber));
    }
    if (!Utils.isEmpty(unitNumber)) {
      params.push(fields.UNIT_NUMBER + '=' + encodeURIComponent(unitNumber));
    }
    if (!Utils.isEmpty(locationPrefill) && !Utils.isEmpty(fields.LOCATION)) {
      params.push(fields.LOCATION + '=' + encodeURIComponent(locationPrefill));
    }

    return base + '&' + params.join('&');
  }

  return { onSubmit: onSubmit, buildPrefilledUrl: buildPrefilledUrl };
})();
