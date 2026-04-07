/**
 * CalendarHandlers.gs
 * Functions for creating, updating, and reading Google Calendar events.
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

  return { createEvent: createEvent, deleteEvent: deleteEvent };
})();
