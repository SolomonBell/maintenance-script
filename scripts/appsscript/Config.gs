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

  // Intake Form
  // To find entry IDs: open the form > ⋮ menu > "Get pre-filled link" >
  // fill dummy values > copy the URL > read the entry.XXXXXXXXX params.
  INTAKE_FORM_ID: 'your_form_id_here',
  INTAKE_FORM_FIELDS: {
    FULL_NAME:    'entry.000000001',  // replace with real entry ID
    PHONE_NUMBER: 'entry.000000002',  // replace with real entry ID
    UNIT_NUMBER:  'entry.000000003',  // replace with real entry ID
  },
};
