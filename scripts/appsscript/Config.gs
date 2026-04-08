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

  // Google Sheets
  BOOKINGS_SHEET_NAME: PropertiesService.getScriptProperties().getProperty('BOOKINGS_SHEET_NAME'),

  // Intake Form (REAL VALUES)
  // Public /d/e/... ID — used in prefilled viewform URLs
  INTAKE_FORM_PUBLIC_ID: 'FORM_PUBLIC_ID_REMOVED',
  // Edit-mode ID — used for FormApp.openById() and trigger installation
  INTAKE_FORM_EDIT_ID: 'FORM_EDIT_ID_REMOVED',
  INTAKE_FORM_FIELDS: {
    FULL_NAME:    'entry.XXXXXXXXX',
    PHONE_NUMBER: 'entry.XXXXXXXXX',
    UNIT_NUMBER:  'entry.XXXXXXXXX',
    EMAIL:        'entry.XXXXXXXXX',
    REQUEST_TYPE: 'entry.XXXXXXXXX',
    NOTES:        'entry.XXXXXXXXX',
  },
};
