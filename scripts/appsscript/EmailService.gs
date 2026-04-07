/**
 * EmailService.gs
 * Wrappers around GmailApp for sending transactional email.
 */

var EmailService = (function () {

  /**
   * Sends a plain-text or HTML email.
   * @param {string} to - Recipient address.
   * @param {string} subject
   * @param {string} body - Plain-text body.
   * @param {Object} [options] - Optional: { htmlBody, cc, bcc, replyTo }
   */
  function send(to, subject, body, options) {
    options = options || {};
    GmailApp.sendEmail(to, subject, body, {
      htmlBody: options.htmlBody || body,
      cc: options.cc || '',
      bcc: options.bcc || '',
      replyTo: options.replyTo || '',
    });
  }

  /**
   * Sends a notification email to the configured admin address.
   * @param {string} subject
   * @param {string} body
   */
  function notify(subject, body) {
    send(CONFIG.NOTIFICATION_EMAIL, subject, body);
  }

  return { send: send, notify: notify };
})();
