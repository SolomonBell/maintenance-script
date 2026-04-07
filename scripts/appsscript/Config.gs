/**
 * Config.gs
 * Central configuration constants.
 * Pull sensitive values from Script Properties, never hard-code them.
 *
 * Usage:
 *   const props = PropertiesService.getScriptProperties();
 *   const stripeKey = props.getProperty('STRIPE_SECRET_KEY');
 */

var CONFIG = {
  // Google Sheets
  SPREADSHEET_ID: PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'),

  // Stripe
  STRIPE_SECRET_KEY: PropertiesService.getScriptProperties().getProperty('STRIPE_SECRET_KEY'),
  STRIPE_WEBHOOK_SECRET: PropertiesService.getScriptProperties().getProperty('STRIPE_WEBHOOK_SECRET'),

  // Docuseal
  DOCUSEAL_API_KEY: PropertiesService.getScriptProperties().getProperty('DOCUSEAL_API_KEY'),
  DOCUSEAL_BASE_URL: PropertiesService.getScriptProperties().getProperty('DOCUSEAL_BASE_URL'),

  // Notifications
  NOTIFICATION_EMAIL: PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL'),
};
