# Reliable Storage Maintenance Booking System

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
        ├── CalendarHandlers.gs  — Alternative direct calendar-trigger intake path (not active)
        ├── Config.gs            — Script Properties wrapper + location map
        └── Utils.gs             — Shared helpers
        │
        ▼
Google Sheets (Bookings log)
```

Pipedream is the integration layer between all external services and the Apps Script web app. All state changes and email sends are handled exclusively inside Apps Script.

---

## Booking Flow

### Standard Request (Non-Lock-Cut)

1. Customer books a maintenance appointment via Google Appointment Schedules
2. Pipedream detects the new Calendar event, extracts customer fields (including a `bookingSource` field that identifies the booking page), and POSTs a `booking.created` payload to the Apps Script web app
3. Apps Script emails the customer a pre-filled intake form link via SendGrid and appends a booking row to the Bookings sheet (status: `Intake Sent`)
4. Customer submits the intake form
5. Apps Script locates the booking row by email address, updates phone, unit, location, Request Type, and Notes from the form response, and sets status to `Form Submitted`
6. Apps Script sends the customer a confirmation email, notifies the manager, and sets status to `Confirmed`

### Lock Cut Request

Lock cuts require a payment and a signed release authorization before the appointment is confirmed. Steps 1–5 are identical to the standard flow. At step 5, when the intake form identifies a lock cut request:

6. Apps Script simultaneously creates a Stripe Checkout Session and a DocuSeal signing submission
7. Customer receives a single email containing the payment link and the release form signing link (status: `Pending Payment + Signature`)
8. Customer completes payment → Stripe fires `checkout.session.completed` → Pipedream forwards the payload to Apps Script → Stripe session ID written to the booking row
9. Customer signs the release form → DocuSeal fires `submission.completed` → Pipedream forwards the payload to Apps Script → DocuSeal submission ID written to the booking row
10. Once both IDs are present, Apps Script sets status to `Confirmed`, sends the customer a final appointment confirmation, and notifies the manager

Steps 8 and 9 can complete in either order; finalization triggers only when both are recorded.

**Lock cut detection:** A form submission is treated as a lock cut request when the Request Type response contains the word `lock` (case-insensitive). The Request Type option in the intake form must include that word for the lock-cut path to trigger.

---

## Location Routing

Incoming Pipedream webhooks include a `bookingSource` field whose value must exactly match a key in `CONFIG.LOCATION_MAP` in [`Config.gs`](scripts/appsscript/Config.gs). Each entry maps a booking page title to a location name and location group.

### Current Location Map

| Booking Page Title | Location | Location Group |
|---|---|---|
| `Bainbridge Maintenance` | Bainbridge | Group 1 |
| `Poulsbo Maintenance` | Poulsbo | Group 2 |
| `Port Orchard Maintenance` | Port Orchard | Group 3 |
| `Kingston & Silverdale Maintenance` | Kingston / Silverdale | Group 4 |
| `Fairgrounds & Waaga Way Maintenance` | Fairgrounds / Waaga Way | Group 5 |

**Groups 1–3** are single-location booking pages. The resolved location name is automatically pre-filled in the customer's intake form URL.

**Groups 4–5** are multi-location booking pages shared across two sites. Location pre-fill is intentionally omitted; the customer selects their specific location on the intake form.

If `bookingSource` is absent or unrecognized, the booking row is written with **Location and Location Group left blank**. No default location is silently substituted. The GAS execution log records the exact value received and lists all valid `LOCATION_MAP` keys. To add a new location, add a new entry to `LOCATION_MAP` in `Config.gs` and set up a matching booking page in Google Calendar.

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
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_live_...` in production) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (reserved for future signature verification) |
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
| `DEFAULT_LOCATION` | Reserved — no longer used for routing. Unmapped bookings leave Location blank. |
| `DEFAULT_LOCATION_GROUP` | Reserved — no longer used for routing. Unmapped bookings leave Location Group blank. |
| `COMPANY_NAME` | Company name in outbound emails (defaults to `Reliable Storage` if not set) |
| `LOCK_CUT_FEE` | Fee shown in lock-cut emails (defaults to `$50` if not set) |

---

## Pipedream Environment Variables

Set these under **Pipedream → Settings → Environment Variables**. All three workflows use both variables.

| Variable | Description |
|---|---|
| `GAS_WEB_APP_URL` | The Apps Script web app URL (`https://script.google.com/macros/s/…/exec`). Set once; referenced in every workflow's URL field as `{{process.env.GAS_WEB_APP_URL}}?source=pipedream`. Do **not** include `?source=pipedream` in the variable itself. |
| `GAS_PIPEDREAM_SECRET` | Shared secret used to authenticate Pipedream payloads. Must match the `PIPEDREAM_SECRET` Script Property exactly — no leading or trailing whitespace. |

In every Pipedream HTTP Request step:

- **URL field:** `{{process.env.GAS_WEB_APP_URL}}?source=pipedream`
- **`secret` field in JSON body:** `{{process.env.GAS_PIPEDREAM_SECRET}}`

> `source=pipedream` must be a **URL query parameter**, not a JSON body field. The GAS router reads `e.parameter.source` from query parameters; the JSON body is parsed separately from `e.postData.contents`.

---

## Bookings Sheet Schema

| # | Column | Written by |
|---|---|---|
| 1 | Timestamp | `handlePipedream` on booking created |
| 2 | Location | `handlePipedream` on booking created |
| 3 | Location Group | `handlePipedream` on booking created |
| 4 | First Name | `handlePipedream` on booking created |
| 5 | Last Name | `handlePipedream` on booking created |
| 6 | Phone | `handlePipedream` on booking created (if provided); updated by `onFormSubmit` |
| 7 | Email | `handlePipedream` on booking created |
| 8 | Unit Number | `handlePipedream` on booking created (if provided); updated by `onFormSubmit` |
| 9 | Request Type | `onFormSubmit` |
| 10 | Booked Date | `handlePipedream` on booking created |
| 11 | Booked Time | `handlePipedream` on booking created |
| 12 | Notes | `onFormSubmit` |
| 13 | Status | Updated throughout the flow (see Status Values below) |
| 14 | Fee Required | `onFormSubmit` (lock cut path) |
| 15 | Fee Paid | `handleStripeCompleted` |
| 16 | Signature Required | `onFormSubmit` (lock cut path) |
| 17 | Signature Complete | `handleDocusealCompleted` |
| 18 | Calendar Event ID | `handlePipedream` on booking created |
| 19 | Stripe Payment ID | `handleStripeCompleted` |
| 20 | DocuSeal Document ID | `handleDocusealCompleted` |
| 21 | Final Confirmation Sent | `onFormSubmit` (standard path) or `checkAndFinalize` (lock cut path) |

Phone and unit are collected from the booking payload when available. If the customer books without answering those questions, the fields are left blank at booking creation and filled in when the intake form is submitted.

---

## Status Values

| Status | Set by | Condition |
|---|---|---|
| `Intake Sent` | `handlePipedream` | New booking received; intake form emailed to customer |
| `Form Submitted` | `onFormSubmit` | Intake form received; set before lock-cut branching |
| `Pending Payment + Signature` | `onFormSubmit` | Lock cut: payment and signature links sent; both still pending |
| `Pending Payment` | `checkAndFinalize` | Lock cut: DocuSeal complete, Stripe payment not yet received |
| `Pending Signature` | `checkAndFinalize` | Lock cut: Stripe complete, DocuSeal signature not yet received |
| `Confirmed` | `onFormSubmit` or `checkAndFinalize` | All requirements met; final confirmation email sent |
| `Completed` | Manual (in Sheets) | Appointment has taken place |

---

## Webhook Events

All three events are routed through Pipedream to the Apps Script web app endpoint (`POST /exec?source=pipedream`).

| Event | Source | GAS handler | Key payload fields |
|---|---|---|---|
| `booking.created` | Google Calendar (new event) | `handlePipedream` | `secret`, `event`, `fullName`, `email`, `phoneNumber`, `unitNumber`, `bookedDate`, `bookedTime`, `calendarEventId`, `bookingSource` |
| `stripe_checkout_completed` | Stripe (`checkout.session.completed`) | `handleStripeCompleted` | `secret`, `eventType`, `email`, `stripeSessionId` |
| `docuseal_submission_completed` | DocuSeal (`submission.completed`) | `handleDocusealCompleted` | `secret`, `eventType`, `email`, `docusealSubmissionId` |

`source=pipedream` must be sent as a URL query parameter, not in the JSON body. The GAS router reads `e.parameter.source` from query parameters; the JSON body is parsed separately from `e.postData.contents`.

See [`scripts/pipedream/booking-workflow-reference.md`](scripts/pipedream/booking-workflow-reference.md) for the full Pipedream workflow implementation, including trigger configuration, step code, and request body templates.

---

## Deployment

### Apps Script Web App

1. Open the Apps Script project editor
2. Click **Deploy → Manage deployments**
3. Edit the **existing** deployment — do not create a new one. A new deployment generates a new URL, which must then be updated in all three Pipedream workflows
4. Confirm **Execute as:** Me and **Who has access:** Anyone (even anonymous)
5. Click **Deploy** and confirm the URL has not changed

After any code change, redeploy the same deployment to make it live. The URL stays the same.

### Form Submit Trigger

The `formSubmitTrigger` function must be connected to the intake form via an installable trigger. Run this **once** from the Apps Script editor:

```
installFormSubmitTrigger()
```

Confirm the trigger appears under **Triggers (clock icon)** with handler `formSubmitTrigger`. The function includes a duplicate guard, but running it more than once is still inadvisable.

---

## Testing

See [`scripts/pipedream/booking-workflow-live-test-checklist.md`](scripts/pipedream/booking-workflow-live-test-checklist.md) for the complete staged end-to-end test checklist covering:

- Apps Script web app deployment and Script Properties setup
- Pipedream workflow configuration (trigger, extract step, HTTP step)
- Full `booking.created` end-to-end test including email and sheet verification
- Stripe completion forwarding and sheet update verification
- DocuSeal completion forwarding and final confirmation verification
- Troubleshooting guidance for common failure modes

---

## Production Notes

- **DocuSeal auto-emails:** DocuSeal's built-in email notifications are disabled in `DocusealService.gs` (`send_email: false`). Apps Script controls all outbound customer email via SendGrid. Do not re-enable DocuSeal auto-emails or customers will receive duplicate messages.
- **Stripe mode:** Confirm `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` are live-mode values before going to production. Test-mode keys begin with `sk_test_`; live-mode keys begin with `sk_live_`.
- **SendGrid sender verification:** The domain or address set in `SENDGRID_FROM_EMAIL` must be verified in SendGrid (Domain Authentication or Single Sender Verification) before email delivery will succeed in production.
- **Pipedream secret:** `GAS_PIPEDREAM_SECRET` (Pipedream Environment Variable) must exactly match `PIPEDREAM_SECRET` (GAS Script Property), including capitalization and no leading or trailing whitespace.
- **GAS always returns HTTP 200:** `ContentService` does not support custom HTTP status codes. Every response arrives at Pipedream as HTTP 200 regardless of success or failure. Inspect the response body (`{"error":"..."}`) to detect failures in Pipedream step logs.

---

## Known Limitations

- Stripe webhook signature verification (`Stripe-Signature` header validation) is not yet implemented. Stripe events arrive via Pipedream with shared-secret authentication only.
- No idempotency guard beyond the existing `Confirmed` status check. Duplicate Pipedream deliveries of a `booking.created` event for the same booking would append a second row.
- Reschedule and cancellation handling is not implemented. Calendar event updates do not modify existing booking records.
- The direct-Calendar trigger path in `CalendarHandlers.gs` (`onBookingCreated`) is an alternative that bypasses Pipedream entirely. It is not active in the current production configuration and does not support location pre-fill without a code update.
