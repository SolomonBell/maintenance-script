/**

* Config.gs
* Central configuration constants.
* Pull sensitive values from Script Properties, never hard-code them.
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

  // Pipedream
  PIPEDREAM_SECRET: PropertiesService.getScriptProperties().getProperty('PIPEDREAM_SECRET'),

  // Intake Form (REAL VALUES)
  INTAKE_FORM_ID: 'FORM_PUBLIC_ID_REMOVED',
  INTAKE_FORM_FIELDS: {
    FULL_NAME:         'entry.XXXXXXXXX',
    PHONE_NUMBER:      'entry.XXXXXXXXX',
    UNIT_NUMBER:       'entry.XXXXXXXXX',
    ISSUE_DESCRIPTION: 'entry.XXXXXXXXX',
  },
};
