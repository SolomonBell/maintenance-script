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
2. Pipedream detects the new Calendar event, extracts customer fields, and POSTs them to the Apps Script web app
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

## Bookings Sheet Schema

| # | Column | Written by |
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

## Future Improvements

- Stripe webhook signature verification (`Stripe-Signature` header validation)
- Idempotency guard for duplicate Pipedream webhook deliveries beyond the existing `Confirmed` status check
- Reschedule and cancellation handling via the `Event Updated` Calendar trigger
- Push-based Calendar notifications in place of Pipedream's polling trigger
