# Pipedream Booking Workflow — Reference Implementation

Triggers when a new Google Calendar booking event is created, extracts customer
data, and POSTs a structured payload to the Google Apps Script web app, which
generates a pre-filled intake form URL and emails it to the customer.

---

## Workflow Overview

```
Trigger  →  Step 1: extract_booking_fields  →  Step 2: send_to_gas
```

---

## Trigger: Google Calendar — New Event

| Setting       | Value                                              |
|---------------|----------------------------------------------------|
| App           | Google Calendar                                    |
| Trigger event | New Event                                          |
| Calendar      | Paste your Google Calendar ID (see Calendar settings → Integrate calendar) |
| Account       | Connect the Google account that owns the calendar  |

> **Note:** Use the "New Event" trigger (not "Event Updated") for MVP. "New
> Event" fires only on creation. "Event Updated" fires on every change including
> reschedules and would require idempotency handling before it is safe to use.

The trigger makes the full Calendar API v3 event object available to downstream
steps as `steps.trigger.event`.

---

## Step 1: extract_booking_fields

**Step type:** Run Node.js code  
**Step name:** `extract_booking_fields`

### Where each field comes from

| Field         | Source                                         | Structured? |
|---------------|------------------------------------------------|-------------|
| `email`       | `event.attendees[]` — non-organizer attendee   | Yes         |
| `fullName`    | `attendees[].displayName`                      | Yes         |
| `phoneNumber` | `event.description` — custom question answer   | No — text   |
| `unitNumber`  | `event.description` — custom question answer   | No — text   |

Google Appointment Schedules writes custom question answers into the event
description in a consistent but Google-controlled format. Phone and unit are
extracted via regex. If you rename either custom question in Appointment
Schedules, update the regex labels here to match.

### Code

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

    // Fail loudly — do not send a broken payload to GAS.
    const missing = [];
    if (!email)       missing.push('email');
    if (!fullName)    missing.push('fullName');
    if (!phoneNumber) missing.push('phoneNumber');
    if (!unitNumber)  missing.push('unitNumber');

    if (missing.length) {
      throw new Error(
        `Booking event is missing required fields: ${missing.join(', ')}.\n`
        + `Raw description:\n${desc}`
      );
    }

    return { email, fullName, phoneNumber, unitNumber };
  }
});
```

---

## Step 2: send_to_gas

**Step type:** HTTP Request  
**Step name:** `send_to_gas`

| Setting      | Value                                          |
|--------------|------------------------------------------------|
| Method       | POST                                           |
| URL          | `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?source=pipedream` |
| Content-Type | `application/json`                             |

> **Important:** `source=pipedream` must be a **URL query parameter**, not a
> JSON body field. The GAS router reads `e.parameter.source`, which maps to
> query parameters only. The JSON body is separately parsed from
> `e.postData.contents`.

### Request body

```json
{
  "event":       "booking.created",
  "secret":      "{{process.env.GAS_PIPEDREAM_SECRET}}",
  "fullName":    "{{steps.extract_booking_fields.$return_value.fullName}}",
  "phoneNumber": "{{steps.extract_booking_fields.$return_value.phoneNumber}}",
  "unitNumber":  "{{steps.extract_booking_fields.$return_value.unitNumber}}",
  "email":       "{{steps.extract_booking_fields.$return_value.email}}"
}
```

The `secret` must match the `PIPEDREAM_SECRET` Script Property set in the Apps
Script project.

**Expected success response from GAS:**
```json
{ "received": true, "email": "customer@example.com" }
```

---

## Required Pipedream Environment Variables

Set these in Pipedream under **Settings → Environment Variables**.

| Variable             | Description                                              |
|----------------------|----------------------------------------------------------|
| `GAS_PIPEDREAM_SECRET` | Shared secret. Must match `PIPEDREAM_SECRET` in GAS Script Properties exactly. |

---

## Required Apps Script Deployment Settings

In the Apps Script editor (*Deploy → Manage deployments*):

| Setting          | Required value                  |
|------------------|---------------------------------|
| Execute as       | Me (your Google account)        |
| Who has access   | Anyone (even anonymous)         |
| Deployment type  | Web app                         |

> Always update the **same deployment** rather than creating a new one. Creating
> a new deployment generates a new URL, which must then be updated in Pipedream.

The corresponding Script Property keys (`PIPEDREAM_SECRET`, `SPREADSHEET_ID`,
etc.) are set under *Project Settings → Script Properties*.

---

## Edge Cases and Debugging Notes

**`displayName` is absent.**  
If the customer books without a Google account, `customer.displayName` may be
undefined. In that case the step throws and Pipedream logs the raw event for
inspection. A fallback is to parse `Name:` from the description
(`desc.match(/^Name:\s*(.+)$/im)`), but only add this if it proves necessary.

**Custom question labels changed.**  
If you rename "Phone" or "Unit Number" in Appointment Schedules, the regex
returns null, the step throws, and no email is sent. Update the regex in
`extract_booking_fields` to match the new label. The error message includes the
raw description to make this easy to diagnose.

**Duplicate sends on event touch.**  
The "New Event" trigger fires only on creation, so incidental edits (e.g.
adding a note) do not retrigger. If you switch to "Event Updated" in future,
add idempotency: log processed Calendar event IDs in a Sheets row or Pipedream
Data Store and skip any ID already present.

**GAS always returns HTTP 200 — check the response body for errors.**  
`ContentService` in GAS does not support setting HTTP status codes. Every
response from the web app arrives at Pipedream as HTTP 200, including auth
failures and validation errors. Pipedream's HTTP step will not automatically
mark a run as failed on a wrong secret or missing field. To detect failures,
inspect the response body: a success looks like `{"received":true,"email":"..."}`;
a failure looks like `{"error":"Unauthorized"}` or
`{"error":"Missing required field: unitNumber"}`. Add a Pipedream code step
after `send_to_gas` to throw on `response.body.error` if you need failed runs
to surface in Pipedream's error inspector.

**GAS URL is wrong or the deployment is not live.**  
If the HTTP step returns an HTML error page instead of JSON, the deployment URL
is stale or the web app is not deployed as "Anyone". Redeploy and verify the
URL in *Manage deployments*.
