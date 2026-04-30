# Maintenance Booking System

An end-to-end maintenance appointment automation for a self-storage facility. Customers book via Google Appointment Schedules; the system handles intake, confirmation, payment, e-signature, and status tracking — with all state persisted in Google Sheets and all email delivered through SendGrid.

---

## Tech Stack

| Service | Role |
|---|---|
| Google Calendar / Appointment Schedules | Customer-facing booking interface |
| Google Apps Script | Backend logic and HTTPS web app endpoint |
| Google Sheets | Booking records and status log |
| Google Forms | Customer intake form |
| Pipedream | Event orchestration (Calendar → GAS, Stripe → GAS, DocuSeal → GAS) |
| SendGrid | Transactional email delivery |
| Stripe | Payment processing (lock cut fee) |
| DocuSeal | E-signature (lock cut release authorization) |

---

## Architecture

```
Google Appointment Schedules
        │  new Calendar event
        ▼
    Pipedream ◀──── Stripe   (checkout.session.completed)
        │     ◀──── DocuSeal (submission.completed)
        │  POST /exec?source=pipedream
        ▼
Google Apps Script Web App
        ├── WebhookHandlers.gs   — Pipedream routing + Stripe/DocuSeal finalization
        ├── FormHandlers.gs      — onFormSubmit trigger + lock-cut branching
        ├── EmailService.gs      — SendGrid transactional email
        ├── StripeService.gs     — Checkout Session creation
        ├── DocusealService.gs   — Submission creation
        ├── SheetService.gs      — Bookings sheet read/write
        ├── CalendarHandlers.gs  — Alternative direct calendar-trigger intake path
        ├── Config.gs            — Script Properties wrapper
        └── Utils.gs             — Shared helpers
        │
        ▼
Google Sheets (Bookings log)
```

Pipedream acts as the integration layer between all external services and the Apps Script web app. All state changes and email sends are handled exclusively inside Apps Script.

---

## Standard Booking Flow

1. Customer books a maintenance appointment via Google Appointment Schedules
2. Pipedream detects the new Calendar event, extracts customer fields (including a `bookingSource` field that identifies the booking page), and POSTs them to the Apps Script web app
3. Apps Script emails the customer a pre-filled intake form link via SendGrid and appends a booking row to the Bookings sheet (status: `Intake Sent`)
4. Customer submits the intake form
5. Apps Script locates the booking row by email address, writes Request Type and Notes, and sets status to `Form Submitted`
6. Apps Script sends the customer a confirmation email and notifies the manager at the configured notification address

---

## Lock Cut Flow

Lock cuts require a $50 payment and a signed release authorization before the appointment is confirmed. Steps 1–5 are identical to the standard flow. At step 5, when the intake form identifies a lock cut request:

6. Apps Script simultaneously creates a Stripe Checkout Session and a DocuSeal signing submission
7. Customer receives a single email containing the payment link and the release form signing link (status: `Pending Payment + Signature`)
8. Customer completes payment → Stripe fires `checkout.session.completed` → Pipedream forwards the payload to Apps Script → Stripe session ID written to the booking row
9. Customer signs the release form → DocuSeal fires `submission.completed` → Pipedream forwards the payload to Apps Script → DocuSeal submission ID written to the booking row
10. Once both IDs are present, Apps Script sets status to `Confirmed`, sends the customer a final appointment confirmation, and notifies the manager

Steps 8 and 9 can complete in either order; finalization triggers only when both are recorded.

---

## Configuration

All sensitive values and instance-specific identifiers are stored as **Script Properties** in the Apps Script project. No secrets or IDs are hard-coded in this repository. See [`.env.example`](.env.example) for the full list of required keys and placeholder values.

To set Script Properties in Apps Script:
**Project Settings (gear icon) → Script Properties → Add script property**

| Property | Description |
|---|---|
| `SPREADSHEET_ID` | Google Sheets spreadsheet ID |
| `BOOKINGS_SHEET_NAME` | Sheet tab name (e.g. `Bookings`) |
| `SENDGRID_API_KEY` | SendGrid API key |
| `SENDGRID_FROM_EMAIL` | Sender email address |
| `SENDGRID_FROM_NAME` | Sender display name |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | Stripe Price ID for the lock cut fee |
| `STRIPE_SUCCESS_URL` | Post-payment redirect URL |
| `STRIPE_CANCEL_URL` | Cancelled-payment redirect URL |
| `DOCUSEAL_API_KEY` | DocuSeal API key |
| `DOCUSEAL_BASE_URL` | DocuSeal API base URL |
| `DOCUSEAL_TEMPLATE_ID` | DocuSeal template ID for the release form |
| `NOTIFICATION_EMAIL` | Internal address for booking notifications |
| `PIPEDREAM_SECRET` | Shared secret for authenticating Pipedream webhooks |
| `INTAKE_FORM_PUBLIC_ID` | Google Form public ID (`/d/e/<ID>/viewform`) |
| `INTAKE_FORM_EDIT_ID` | Google Form edit ID (`/d/<ID>/edit`) |
| `INTAKE_FORM_FIELD_FULL_NAME` | Form entry ID for Full Name (`entry.XXXXXXXXX`) |
| `INTAKE_FORM_FIELD_PHONE_NUMBER` | Form entry ID for Phone Number |
| `INTAKE_FORM_FIELD_UNIT_NUMBER` | Form entry ID for Unit Number |
| `INTAKE_FORM_FIELD_EMAIL` | Form entry ID for Email |
| `INTAKE_FORM_FIELD_REQUEST_TYPE` | Form entry ID for Request Type |
| `INTAKE_FORM_FIELD_NOTES` | Form entry ID for Notes |
| `INTAKE_FORM_FIELD_LOCATION` | Form entry ID for Location |
| `DEFAULT_LOCATION` | Fallback location when `bookingSource` is unrecognized |
| `DEFAULT_LOCATION_GROUP` | Fallback location group when `bookingSource` is unrecognized |
| `COMPANY_NAME` | Company name in outbound emails (default: `Reliable Storage`) |
| `LOCK_CUT_FEE` | Fee shown in lock-cut emails (default: `$50`) |

### Location Routing

Incoming Pipedream webhooks include a `bookingSource` field whose value must exactly match a key in `CONFIG.LOCATION_MAP` in [`Config.gs`](scripts/appsscript/Config.gs). Each entry maps a booking page title to a location name and location group:

```javascript
LOCATION_MAP: {
  'My Location Maintenance': { location: 'My Location', locationGroup: 'Group 1' },
  // add one entry per booking page
}
```

Update `LOCATION_MAP` to match your booking page titles. If `bookingSource` is absent or unrecognized, the booking falls back to `DEFAULT_LOCATION` / `DEFAULT_LOCATION_GROUP`.

Location groups `Group 1`–`Group 3` trigger automatic location pre-fill in the intake form URL. Groups `Group 4`–`Group 5` serve multi-location pages where the customer selects their location manually. This is controlled by `singleLocationGroups` in `WebhookHandlers.gs`.

---

## Bookings Sheet Schema

| # | Column | Written by |
|---|---|---|
| 1 | Timestamp | `handlePipedream` on booking created |
| 2 | Location | `handlePipedream` on booking created |
| 3 | Location Group | `handlePipedream` on booking created |
| 4 | First Name | `handlePipedream` on booking created |
| 5 | Last Name | `handlePipedream` on booking created |
| 6 | Phone | `handlePipedream` on booking created |
| 7 | Email | `handlePipedream` on booking created |
| 8 | Unit Number | `handlePipedream` on booking created |
| 9 | Request Type | `onFormSubmit` |
| 10 | Booked Date | `handlePipedream` on booking created |
| 11 | Booked Time | `handlePipedream` on booking created |
| 12 | Notes | `onFormSubmit` |
| 13 | Status | Updated throughout flow |
| 14 | Fee Required | `onFormSubmit` (lock cut path) |
| 15 | Fee Paid | `handleStripeCompleted` |
| 16 | Signature Required | `onFormSubmit` (lock cut path) |
| 17 | Signature Complete | `handleDocusealCompleted` |
| 18 | Calendar Event ID | `handlePipedream` on booking created |
| 19 | Stripe Payment ID | `handleStripeCompleted` |
| 20 | DocuSeal Document ID | `handleDocusealCompleted` |
| 21 | Final Confirmation Sent | `checkAndFinalize` or `onFormSubmit` |

---

## Future Improvements

- Stripe webhook signature verification (`Stripe-Signature` header validation)
- Idempotency guard for duplicate Pipedream webhook deliveries beyond the existing `Confirmed` status check
- Reschedule and cancellation handling via the `Event Updated` Calendar trigger
- Push-based Calendar notifications in place of Pipedream's polling trigger
