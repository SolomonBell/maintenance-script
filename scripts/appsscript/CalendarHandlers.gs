/**
 * CalendarHandlers.gs
 * Functions for creating, updating, and reading Google Calendar events.
 *
 * NOTE — ALTERNATIVE INTAKE PATH (not the current production flow)
 * The production system uses Pipedream to detect new Calendar events and POST
 * a structured payload to the Apps Script web app (handlePipedream in
 * WebhookHandlers.gs). CalendarHandlers.onBookingCreated is a direct
 * calendar-trigger alternative that bypasses Pipedream entirely.
 *
 * Use this path only if you want to replace Pipedream with a native Apps Script
 * calendar trigger. Note that onBookingCreated calls buildPrefilledUrl without
 * a locationPrefill argument, so the location pre-fill feature will not work
 * without a code update.
 *
 * Trigger setup (only needed if using this alternative path):
 *   In the Apps Script editor go to Triggers (clock icon) > Add Trigger:
 *     Function:       onBookingCreated
 *     Event source:   From calendar
 *     Calendar:       (paste your calendar ID)
 *     Event type:     Calendar event updated
 *
 * NOTE: "Calendar event updated" fires on both creates AND edits. If you need
 * to distinguish new bookings from reschedules, add a flag (e.g. a custom
 * property on the event or a log in Sheets) once your booking flow is stable.
 */

var CalendarHandlers = (function () {

  /**
   * Creates a calendar event.
   * @param {string} calendarId
   * @param {string} title
   * @param {Date} startTime
   * @param {Date} endTime
   * @param {Object} [options] - Optional fields: description, location, guests[]
   * @returns {CalendarEvent}
   */
  function createEvent(calendarId, title, startTime, endTime, options) {
    options = options || {};
    var calendar = CalendarApp.getCalendarById(calendarId);
    var event = calendar.createEvent(title, startTime, endTime, {
      description: options.description || '',
      location: options.location || '',
      guests: (options.guests || []).join(','),
    });
    return event;
  }

  /**
   * Deletes an event by ID.
   * @param {string} calendarId
   * @param {string} eventId
   */
  function deleteEvent(calendarId, eventId) {
    var calendar = CalendarApp.getCalendarById(calendarId);
    var event = calendar.getEventById(eventId);
    if (event) event.deleteEvent();
  }

  /**
   * Trigger entry point — called by Apps Script when a calendar event is
   * created or updated.
   *
   * Because the trigger object `e` only contains `calendarId` (not the event
   * itself), we fetch all events updated in the last 5 minutes and process each
   * one. At normal booking volumes this window catches the relevant event
   * without pulling unrelated history.
   *
   * Expected event description format (one field per line):
   *   Phone: 555-0100
   *   Unit: 4B
   *
   * Expected guest list: the customer's email must be the first (or only) guest.
   *
   * @param {Object} e - Apps Script calendar trigger event: { calendarId, triggerUid }
   */
  function onBookingCreated(e) {
    var calendar = CalendarApp.getCalendarById(e.calendarId);
    var now = new Date();
    var fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Fetch recently updated events; at low volume this typically returns one.
    var recentEvents = calendar.getEvents(fiveMinutesAgo, now);

    recentEvents.forEach(function (event) {
      try {
        var booking = parseBookingEvent(event);
        var formUrl = FormHandlers.buildPrefilledUrl(
          booking.fullName,
          booking.phoneNumber,
          booking.unitNumber
        );
        EmailService.send(
          booking.email,
          'Complete your booking — ' + booking.fullName,
          'Hi ' + booking.fullName + ',\n\n'
            + 'Please complete your intake form:\n' + formUrl + '\n\n'
            + 'Reply to this email if you have any questions.'
        );
        Logger.log('Intake form sent to ' + booking.email + ' for event: ' + event.getTitle());
      } catch (err) {
        // Log and continue — a bad event should not block others in the batch.
        Logger.log('onBookingCreated: skipped event "' + event.getTitle() + '": ' + err.message);
      }
    });
  }

  /**
   * Extracts booking fields from a CalendarEvent.
   *
   * Assumes the event is structured as follows:
   *   Title:       Customer's full name (e.g. "Jane Smith")
   *   Description: Contains lines "Phone: ..." and "Unit: ..."
   *   Guests:      First guest is the customer's email address
   *
   * @param {CalendarEvent} event
   * @returns {{ fullName: string, phoneNumber: string, unitNumber: string, email: string }}
   * @throws {Error} If any required field cannot be extracted.
   */
  function parseBookingEvent(event) {
    var fullName = event.getTitle().trim();
    if (Utils.isEmpty(fullName)) throw new Error('Event title (full name) is empty');

    var guests = event.getGuestList();
    if (!guests.length) throw new Error('No guests on event — cannot determine customer email');
    var email = guests[0].getEmail();
    if (Utils.isEmpty(email)) throw new Error('First guest email is empty');

    var description = event.getDescription() || '';

    // Parse "Phone: <value>" — value is everything after the colon, trimmed.
    var phoneMatch = description.match(/^Phone:\s*(.+)$/im);
    if (!phoneMatch) throw new Error('Description missing "Phone:" field. Raw: ' + description);
    var phoneNumber = phoneMatch[1].trim();

    // Parse "Unit: <value>"
    var unitMatch = description.match(/^Unit:\s*(.+)$/im);
    if (!unitMatch) throw new Error('Description missing "Unit:" field. Raw: ' + description);
    var unitNumber = unitMatch[1].trim();

    return { fullName: fullName, phoneNumber: phoneNumber, unitNumber: unitNumber, email: email };
  }

  return { createEvent: createEvent, deleteEvent: deleteEvent, onBookingCreated: onBookingCreated };
})();
