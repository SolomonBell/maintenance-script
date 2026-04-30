# Pipedream Booking Workflow — Reference Implementation

This document describes all three Pipedream workflows that integrate external
services with the Google Apps Script (GAS) web app.

---

## Part 1 — Booking Created Workflow (Google Calendar → Apps Script)

Triggers when a new Google Calendar Appointment Schedule booking is created.
Extracts customer data and POSTs a `booking.created` payload to Apps Script,
which emails the customer a pre-filled intake form and appends the booking row.

### Workflow Overview

```
Trigger (Google Calendar: New Event)
  → Step 1: extract_booking_fields
  → Step 2: send_to_gas
```

---

### Trigger: Google Calendar — New Event

| Setting       | Value                                                         |
|---------------|---------------------------------------------------------------|
| App           | Google Calendar                                               |
| Trigger event | New Event                                                     |
| Calendar      | The calendar that receives your Appointment Schedule bookings |
| Account       | The Google account that owns the calendar                     |

> **Note:** Use the "New Event" trigger (not "Event Updated") for the initial
> setup. "New Event" fires only on creation. "Event Updated" fires on every
> change — including reschedules and edits — and would require idempotency
> handling before it is safe to use.

The trigger makes the full Calendar API v3 event object available to downstream
steps as `steps.trigger.event`.

---

### Step 1: extract_booking_fields

**Step type:** Run Node.js code
**Step name:** `extract_booking_fields`

#### Where each field comes from

| Field             | Source                                                       |
|-------------------|--------------------------------------------------------------|
| `email`           | `event.attendees[]` — non-organizer attendee                 |
| `fullName`        | `attendees[].displayName`                                    |
| `phoneNumber`     | `event.description` — custom question answer                 |
| `unitNumber`      | `event.description` — custom question answer                 |
| `bookedDate`      | `event.start.dateTime`                                       |
| `bookedTime`      | `event.start.dateTime`                                       |
| `calendarEventId` | `event.id`                                                   |
| `bookingSource`   | Identifies the booking page — see note below                 |

Google Appointment Schedules writes custom question answers into the event
description in a consistent but Google-controlled format. Phone and unit are
extracted via regex. If you rename either custom question in Appointment
Schedules, update the regex labels in this step to match.

**`bookingSource` note:** This field routes the booking to the correct location
in Apps Script. Its value must exactly match a key in `CONFIG.LOCATION_MAP` in
`Config.gs`. If it is absent or unrecognized, Apps Script falls back to
`DEFAULT_LOCATION` / `DEFAULT_LOCATION_GROUP`.

How to populate `bookingSource` depends on your Calendar setup:

- **One calendar per location:** Each Pipedream workflow corresponds to one
  calendar. Hardcode the booking page title as a constant in this step.
- **Shared calendar with multiple booking pages:** Extract the booking page title
  from `event.extendedProperties.private` or another field that distinguishes
  pages in your setup.

#### Code

```javascript
export default defineComponent({
  async run({ steps }) {
    const event = steps.trigger.event;

    // Email and name come from the attendees array.
    // The customer is the non-organizer attendee.
    const customer = (event.attendees || []).find(
      a => a.email !== event.organizer?.email
    );
    const email    = customer?.email?.trim();
    const fullName = customer?.displayName?.trim();

    // Phone and unit come from the description (Appointment Schedules custom
    // question answers). Labels must match your question names exactly.
    const desc       = event.description || '';
    const phoneMatch = desc.match(/^Phone:\s*(.+)$/im);
    const unitMatch  = desc.match(/^Unit\s*(?:Number)?:\s*(.+)$/im);

    const phoneNumber = phoneMatch?.[1]?.trim();
    const unitNumber  = unitMatch?.[1]?.trim();

    // Booking date, time, and calendar event ID from structured event fields.
    // dateTime is present for timed events; date is present for all-day events.
    const bookedDateTime  = event.start.dateTime || null;
    const calendarEventId = event.id || '';
    const bookedDate      = bookedDateTime
      ? bookedDateTime.slice(0, 10)
      : (event.start.date || '');
    const bookedTime = bookedDateTime ? bookedDateTime.slice(11, 16) : '';
    // bookedTime reflects the timezone offset in the Calendar event (local time).
    // Do not convert to UTC.

    // bookingSource must exactly match a key in CONFIG.LOCATION_MAP in Config.gs.
    // See the note above for how to derive this value from your Calendar setup.
    const bookingSource = 'Your Booking Page Title'; // customize per your setup

    // Fail loudly — do not send a broken payload to GAS.
    const missing = [];
    if (!email)    missing.push('email');
    if (!fullName) missing.push('fullName');

    if (missing.length) {
      throw new Error(
        `Booking event is missing required fields: ${missing.join(', ')}.\n`
        + `Raw description:\n${desc}`
      );
    }

    return {
      email, fullName, phoneNumber, unitNumber,
      bookedDate, bookedTime, calendarEventId, bookingSource,
    };
  }
});
```

---

### Step 2: send_to_gas

**Step type:** HTTP Request
**Step name:** `send_to_gas`

| Setting      | Value                                                                                   |
|--------------|-----------------------------------------------------------------------------------------|
| Method       | POST                                                                                    |
| URL          | `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?source=pipedream`          |
| Content-Type | `application/json`                                                                      |

> **Important:** `source=pipedream` must be a **URL query parameter**, not a
> JSON body field. The GAS router reads `e.parameter.source` from query
> parameters only. The JSON body is separately parsed from `e.postData.contents`.

#### Request body

```json
{
  "event":           "booking.created",
  "secret":          "{{process.env.GAS_PIPEDREAM_SECRET}}",
  "fullName":        "{{steps.extract_booking_fields.$return_value.fullName}}",
  "phoneNumber":     "{{steps.extract_booking_fields.$return_value.phoneNumber}}",
  "unitNumber":      "{{steps.extract_booking_fields.$return_value.unitNumber}}",
  "email":           "{{steps.extract_booking_fields.$return_value.email}}",
  "bookedDate":      "{{steps.extract_booking_fields.$return_value.bookedDate}}",
  "bookedTime":      "{{steps.extract_booking_fields.$return_value.bookedTime}}",
  "calendarEventId": "{{steps.extract_booking_fields.$return_value.calendarEventId}}",
  "bookingSource":   "{{steps.extract_booking_fields.$return_value.bookingSource}}"
}
```

The `secret` value must match the `PIPEDREAM_SECRET` Script Property set in the
Apps Script project.

**Expected success response:**
```json
{ "received": true, "email": "customer@example.com" }
```

---

## Part 2 — Stripe Completion Workflow (Stripe → Apps Script)

Triggers when Stripe fires a `checkout.session.completed` event. Forwards the
session details to Apps Script, which marks the booking row as fee-paid and
finalizes the appointment if the DocuSeal signature is also complete.

### Trigger: HTTP Webhook (Stripe)

In your Stripe Dashboard go to **Developers → Webhooks → Add endpoint** and
point the endpoint URL to the Pipedream HTTP source for this workflow. Listen
for the `checkout.session.completed` event type.

### Step: send_stripe_completion_to_gas

**Step type:** HTTP Request

| Setting      | Value                                                                          |
|--------------|--------------------------------------------------------------------------------|
| Method       | POST                                                                           |
| URL          | `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?source=pipedream` |
| Content-Type | `application/json`                                                             |

#### Request body

```json
{
  "secret":          "{{process.env.GAS_PIPEDREAM_SECRET}}",
  "eventType":       "stripe_checkout_completed",
  "email":           "{{steps.trigger.event.body.data.object.customer_email}}",
  "stripeSessionId": "{{steps.trigger.event.body.data.object.id}}"
}
```

> `customer_email` is the `customer_email` field set when the Checkout Session
> was created. `id` is the session ID. Confirm the field paths match the actual
> Stripe webhook payload shape visible in Pipedream's trigger inspector.

**Expected success response:**
```json
{ "received": true }
```

---

## Part 3 — DocuSeal Completion Workflow (DocuSeal → Apps Script)

Triggers when DocuSeal fires a `submission.completed` event. Forwards the
submission details to Apps Script, which marks the booking row as
signature-complete and finalizes the appointment if the Stripe payment is also
complete.

### Trigger: HTTP Webhook (DocuSeal)

In DocuSeal go to **Settings → Webhooks** and add the Pipedream HTTP source URL
for this workflow. Listen for the `submission.completed` event type.

### Step: send_docuseal_completion_to_gas

**Step type:** HTTP Request

| Setting      | Value                                                                          |
|--------------|--------------------------------------------------------------------------------|
| Method       | POST                                                                           |
| URL          | `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?source=pipedream` |
| Content-Type | `application/json`                                                             |

#### Request body

```json
{
  "secret":               "{{process.env.GAS_PIPEDREAM_SECRET}}",
  "eventType":            "docuseal_submission_completed",
  "email":                "{{steps.trigger.event.body.submitters[0].email}}",
  "docusealSubmissionId": "{{steps.trigger.event.body.id}}"
}
```

> `submitters[0].email` is the customer's email (the first submitter). `id` is
> the DocuSeal submission ID. Confirm paths against the actual DocuSeal webhook
> payload visible in Pipedream's trigger inspector.

**Expected success response:**
```json
{ "received": true }
```

---

## Required Pipedream Environment Variables

Set these under **Pipedream → Settings → Environment Variables**. The same value
is used across all three workflows.

| Variable               | Description                                                          |
|------------------------|----------------------------------------------------------------------|
| `GAS_PIPEDREAM_SECRET` | Shared secret. Must match `PIPEDREAM_SECRET` in GAS Script Properties exactly. |

---

## Required Apps Script Deployment Settings

In the Apps Script editor (*Deploy → Manage deployments*):

| Setting          | Required value           |
|------------------|--------------------------|
| Execute as       | Me (your Google account) |
| Who has access   | Anyone (even anonymous)  |
| Deployment type  | Web app                  |

> Always update the **same deployment** rather than creating a new one. Creating
> a new deployment generates a new URL, which must then be updated in all three
> Pipedream workflows.

---

## GAS Always Returns HTTP 200

`ContentService` in GAS does not support custom HTTP status codes. Every
response arrives at Pipedream as HTTP 200, even for auth failures and validation
errors. To detect failures, inspect the response body:

| Response body | Meaning |
|---|---|
| `{"received":true,"email":"..."}` | Booking created successfully |
| `{"received":true}` | Stripe or DocuSeal event processed |
| `{"error":"Unauthorized"}` | Secret mismatch — check `GAS_PIPEDREAM_SECRET` vs `PIPEDREAM_SECRET` |
| `{"error":"Missing required field: ..."}` | Required payload field is empty |

Add a code step after each `send_to_gas` step to throw on `response.body.error`
if you want failed runs to surface in Pipedream's error inspector.

---

## Edge Cases and Debugging Notes

**`displayName` is absent.**
If the customer books without a Google account, `customer.displayName` may be
undefined. The step throws and Pipedream logs the raw event for inspection.
A fallback is to parse `Name:` from the description, but only add this if needed.

**Custom question labels changed.**
If you rename "Phone" or "Unit Number" in Appointment Schedules, the regex
returns null and the step throws. Update the regex label in
`extract_booking_fields` to match. The error message includes the raw description
to help diagnose.

**`bookingSource` not in LOCATION_MAP.**
GAS logs a warning, falls back to `DEFAULT_LOCATION` / `DEFAULT_LOCATION_GROUP`,
and continues normally. The booking is still created; only location routing is
affected. Review the `LOCATION_MAP` keys in `Config.gs` and confirm the value
sent by Pipedream matches exactly (case-sensitive).

**Duplicate sends on event touch.**
The "New Event" trigger fires only on creation, so incidental edits do not
retrigger. If you switch to "Event Updated" in future, add idempotency: log
processed Calendar event IDs in Sheets or a Pipedream Data Store and skip any
ID already recorded.

**`send_to_gas` returns an HTML page instead of JSON.**
The deployment URL is wrong or the web app is not deployed as "Anyone". Verify
the URL in Apps Script under **Manage deployments**, confirm access is "Anyone
(even anonymous)", and check that `?source=pipedream` is appended to the URL.
