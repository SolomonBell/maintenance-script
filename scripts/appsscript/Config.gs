/**
 * Config.gs
 * Central configuration constants.
 * Pull sensitive values from Script Properties; never hard-code them.
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
  DOCUSEAL_TEMPLATE_ID: PropertiesService.getScriptProperties().getProperty('DOCUSEAL_TEMPLATE_ID'),

  // Notifications
  NOTIFICATION_EMAIL: PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL'),

  // Business — used in outbound email copy
  COMPANY_NAME: PropertiesService.getScriptProperties().getProperty('COMPANY_NAME') || 'Reliable Storage',
  LOCK_CUT_FEE: PropertiesService.getScriptProperties().getProperty('LOCK_CUT_FEE') || '$50',

  // Pipedream
  PIPEDREAM_SECRET: PropertiesService.getScriptProperties().getProperty('PIPEDREAM_SECRET'),

  // Google Sheets
  BOOKINGS_SHEET_NAME: PropertiesService.getScriptProperties().getProperty('BOOKINGS_SHEET_NAME'),

  // Location defaults — used when bookingSource is absent or unrecognised.
  // Set DEFAULT_LOCATION and DEFAULT_LOCATION_GROUP in Script Properties.
  DEFAULT_LOCATION:       PropertiesService.getScriptProperties().getProperty('DEFAULT_LOCATION'),
  DEFAULT_LOCATION_GROUP: PropertiesService.getScriptProperties().getProperty('DEFAULT_LOCATION_GROUP'),

  // Maps bookingSource (from Pipedream) to Location and Location Group values.
  // Keys must exactly match the booking page title sent in payload.bookingSource.
  LOCATION_MAP: {
    'Bainbridge Maintenance':               { location: 'Bainbridge',               locationGroup: 'Group 1' },
    'Poulsbo Maintenance':                  { location: 'Poulsbo',                  locationGroup: 'Group 2' },
    'Port Orchard Maintenance':             { location: 'Port Orchard',             locationGroup: 'Group 3' },
    'Kingston & Silverdale Maintenance':    { location: 'Kingston / Silverdale',    locationGroup: 'Group 4' },
    'Fairgrounds & Waaga Way Maintenance':  { location: 'Fairgrounds / Waaga Way',  locationGroup: 'Group 5' },
  },

  // Intake Form
  // IDs and field entry IDs are set as Script Properties — never hardcode these.
  INTAKE_FORM_PUBLIC_ID: PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_PUBLIC_ID'),
  INTAKE_FORM_EDIT_ID:   PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_EDIT_ID'),
  INTAKE_FORM_FIELDS: {
    FULL_NAME:    PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_FULL_NAME'),
    LOCATION:     PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_LOCATION'),
    PHONE_NUMBER: PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_PHONE_NUMBER'),
    UNIT_NUMBER:  PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_UNIT_NUMBER'),
    EMAIL:        PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_EMAIL'),
    REQUEST_TYPE: PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_REQUEST_TYPE'),
    NOTES:        PropertiesService.getScriptProperties().getProperty('INTAKE_FORM_FIELD_NOTES'),
  },
};
