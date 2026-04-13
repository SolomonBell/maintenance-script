# Maintenance Booking System

A Google Apps Script automation that handles self-storage maintenance bookings
end-to-end: form intake, confirmation emails, Stripe payment, DocuSeal e-signature,
and Google Sheets logging — all connected via Pipedream and SendGrid.

---

## How It Works

### Standard booking flow

1. Customer books a maintenance appointment via Google Appointment Schedules
2. Pipedream detects the new Calendar event and POSTs to the Apps Script web app
3. Apps Script generates a pre-filled intake form URL and emails it to the customer
4. Customer submits the intake form
5. Apps Script updates the Bookings sheet and sends a confirmation email

### Lock cut flow

1–4 same as above, but when the intake form identifies a lock cut request:

5. Apps Script creates a Stripe Checkout Session and a DocuSeal signing submission
6. Customer receives a single email with both the payment link and the release form link
7. Pipedream forwards the Stripe `checkout.session.completed` event to Apps Script
8. Pipedream forwards the DocuSeal `submission.completed` event to Apps Script
9. When both are confirmed, Apps Script sets the booking to **Confirmed**, sends
   a final confirmation to the customer, and notifies the site manager

---

## Architecture

```
Google Appointment Schedules
        │  (new Calendar event)
        ▼
    Pipedream
        │  POST /exec?source=pipedream
        ▼
Google Apps Script Web App
        ├── FormHandlers.gs      — onFormSubmit trigger
        ├── WebhookHandlers.gs   — Pipedream routing + completion logic
        ├── StripeService.gs     — Checkout Session creation
        ├── DocusealService.gs   — Submission creation
        ├── EmailService.gs      — SendGrid transactional email
        ├── SheetService.gs      — Bookings sheet read/write
        ├── CalendarHandlers.gs  — Calendar event parsing utilities
        ├── Config.gs            — Script Properties wrapper
        └── Utils.gs             — Shared helpers
        │
        ▼
Google Sheets (Bookings log)
```

---

## Tech Stack

| Service | Role |
|---|---|
| Google Apps Script | Backend logic and web app endpoint |
| Google Sheets | Booking records database |
| Google Forms | Customer intake form |
| Google Calendar / Appointment Schedules | Booking intake |
| Pipedream | Event routing (Calendar → GAS, Stripe → GAS, DocuSeal → GAS) |
| SendGrid | Transactional email delivery |
| Stripe | Payment processing (lock cut fee) |
| DocuSeal | E-signature (lock cut release authorization) |

---

## Setup

### 1. Deploy the Apps Script web app

- Open the project in the Apps Script editor
- **Deploy → New deployment → Web app**
- Set **Execute as:** Me
- Set **Who has access:** Anyone
- Copy the deployment URL — you will use it in Pipedream

### 2. Set Script Properties

In the Apps Script editor go to **Project Settings → Script Properties** and add:

| Key | Description |
|---|---|
| `SPREADSHEET_ID` | Google Sheets ID for the Bookings sheet |
| `BOOKINGS_SHEET_NAME` | Sheet tab name (e.g. `Bookings`) |
| `PIPEDREAM_SECRET` | Shared secret for authenticating Pipedream requests |
| `NOTIFICATION_EMAIL` | Email address for internal manager notifications |
| `SENDGRID_API_KEY` | SendGrid API key with Mail Send permission |
| `SENDGRID_FROM_EMAIL` | Verified sender address |
| `SENDGRID_FROM_NAME` | Display name for outbound emails |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | Stripe Price ID for the lock cut fee |
| `STRIPE_SUCCESS_URL` | Redirect URL after successful payment |
| `STRIPE_CANCEL_URL` | Redirect URL if payment is cancelled |
| `DOCUSEAL_API_KEY` | DocuSeal API key |
| `DOCUSEAL_BASE_URL` | DocuSeal API base URL (e.g. `https://api.docuseal.com`) |
| `DOCUSEAL_TEMPLATE_ID` | DocuSeal template ID for the lock cut release form |
| `INTAKE_FORM_PUBLIC_ID` | Google Form public ID (from the `/d/e/<ID>/viewform` URL) |
| `INTAKE_FORM_EDIT_ID` | Google Form edit ID (from the `/d/<ID>/edit` URL) |
| `INTAKE_FORM_FIELD_FULL_NAME` | Form entry ID for Full Name (`entry.XXXXXXXXX`) |
| `INTAKE_FORM_FIELD_PHONE_NUMBER` | Form entry ID for Phone Number |
| `INTAKE_FORM_FIELD_UNIT_NUMBER` | Form entry ID for Unit Number |
| `INTAKE_FORM_FIELD_EMAIL` | Form entry ID for Email |
| `INTAKE_FORM_FIELD_REQUEST_TYPE` | Form entry ID for Request Type |
| `INTAKE_FORM_FIELD_NOTES` | Form entry ID for Notes |

> Form entry IDs are found via **Google Form → More options → Get pre-filled link**.
> Fill in each field, copy the resulting URL, and read the `entry.XXXXXXXXX` values.

### 3. Install the form submit trigger

Run `installFormSubmitTrigger()` once from the Apps Script editor to wire the
`formSubmitTrigger` function to the intake form's `onFormSubmit` event.
Do not run it more than once — it will create duplicate triggers.

### 4. Configure Pipedream

Set the following Pipedream environment variable under **Settings → Environment Variables**:

| Variable | Value |
|---|---|
| `GAS_PIPEDREAM_SECRET` | Same value as `PIPEDREAM_SECRET` in Script Properties |

Wire three Pipedream workflows to POST to your Apps Script web app URL with
`?source=pipedream` appended:

- **booking.created** — triggered by a new Google Calendar event; extracts
  customer fields and POSTs them to Apps Script
- **stripe_checkout_completed** — triggered by Stripe `checkout.session.completed`;
  forwards `email` and `stripeSessionId`
- **docuseal_submission_completed** — triggered by DocuSeal `submission.completed`;
  forwards `email` and `docusealSubmissionId`

See [`scripts/pipedream/booking-workflow-reference.md`](scripts/pipedream/booking-workflow-reference.md)
for the full Pipedream step code and payload shapes.

---

## Bookings Sheet Schema

The Bookings sheet must have these column headers in order:

| # | Column | Set by |
|---|---|---|
| 1 | Timestamp | Pipedream webhook |
| 2 | First Name | Pipedream webhook |
| 3 | Last Name | Pipedream webhook |
| 4 | Phone | Pipedream webhook |
| 5 | Email | Pipedream webhook |
| 6 | Unit Number | Pipedream webhook |
| 7 | Request Type | Form submit |
| 8 | Booked Date | Pipedream webhook |
| 9 | Booked Time | Pipedream webhook |
| 10 | Notes | Form submit |
| 11 | Status | Updated throughout flow |
| 12 | Calendar Event ID | Pipedream webhook |
| 13 | Stripe Payment ID | Stripe completion webhook |
| 14 | Docuseal Document ID | DocuSeal completion webhook |
| 15 | Confirmation Sent | Pipedream webhook |

---

## Current Status

- Standard booking flow (intake form → confirmation email) is complete and live
- Lock cut flow (Stripe payment + DocuSeal signature → confirmed booking) is complete and live
- Webhook-based finalization (both completions trigger sheet update + confirmation email) is complete and live

---

## Future Improvements

- Stripe webhook signature verification (`Stripe-Signature` header validation)
- Idempotency handling for duplicate Pipedream webhook deliveries beyond the current `Confirmed` status guard
- Reschedule / cancellation handling via the `Event Updated` Calendar trigger
- Admin dashboard or Sheets-based reporting view
- Switch from polling-based Pipedream Calendar trigger to push-based notifications
