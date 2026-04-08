/**
 * EmailService.gs
 * Wrappers around SendGrid v3 Mail Send for transactional email.
 */

var EmailService = (function () {

  var SENDGRID_URL = 'https://api.sendgrid.com/v3/mail/send';

  /**
   * Sends a plain-text or HTML email via SendGrid.
   * @param {string} to - Recipient address.
   * @param {string} subject
   * @param {string} body - Plain-text body.
   * @param {Object} [options] - Optional: { htmlBody, cc, bcc, replyTo }
   */
  function send(to, subject, body, options) {
    options = options || {};

    var props = PropertiesService.getScriptProperties();
    var apiKey   = props.getProperty('SENDGRID_API_KEY');
    var fromEmail = props.getProperty('SENDGRID_FROM_EMAIL');
    var fromName  = props.getProperty('SENDGRID_FROM_NAME') || '';

    if (!apiKey)    throw new Error('EmailService.send: SENDGRID_API_KEY is not set');
    if (!fromEmail) throw new Error('EmailService.send: SENDGRID_FROM_EMAIL is not set');

    var content = [
      { type: 'text/plain', value: body },
      { type: 'text/html',  value: options.htmlBody || body },
    ];

    var payload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromEmail, name: fromName },
      subject: subject,
      content: content,
    };

    var response = UrlFetchApp.fetch(SENDGRID_URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      var body_ = response.getContentText();
      Logger.log('EmailService.send: SendGrid error ' + code + ' — ' + body_);
      throw new Error('EmailService.send: SendGrid returned ' + code);
    }
  }

  /**
   * Sends a notification email to the configured admin address.
   * @param {string} subject
   * @param {string} body
   * @param {Object} [options] - Optional: { htmlBody, cc, bcc, replyTo }
   */
  function notify(subject, body, options) {
    if (!CONFIG.NOTIFICATION_EMAIL) {
      Logger.log('EmailService.notify: NOTIFICATION_EMAIL is not set — skipping internal notification.');
      return;
    }
    send(CONFIG.NOTIFICATION_EMAIL, subject, body, options);
  }

  return { send: send, notify: notify };
})();
