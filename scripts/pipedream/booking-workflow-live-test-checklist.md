# Booking Workflow Live Test Checklist

End-to-end verification checklist for the Pipedream → Apps Script booking
integration. Work through each stage in order. Do not proceed to the next stage
until the expected result for the current one is confirmed.

Reference: [`booking-workflow-reference.md`](booking-workflow-reference.md)

---

## Stage 1 — Deploy the Apps Script Web App

- [ ] Open the Apps Script project in the editor
- [ ] Click **Deploy → Manage deployments → New deployment**
      (or edit the existing deployment if one already exists)
- [ ] Set **Execute as:** Me
- [ ] Set **Who has access:** Anyone (even anonymous)
- [ ] Set **Type:** Web app
- [ ] Click **Deploy** and copy the web app URL
- [ ] Save the URL as the `GAS_WEB_APP_URL` environment variable in Pipedream
      (**Pipedream → Settings → Environment Variables**) — you will reference it in Stages 7, 9, and 10

**Expected result:** A URL of the form
`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec` is available.
Visiting it in a browser returns `{"status":"ok"}`.

> If you make any code changes to the Apps Script project after this point,
> click **Manage deployments → Edit → Deploy** to update the same deployment.
> If you must create a new deployment (generating a new URL), update only the
> `GAS_WEB_APP_URL` environment variable in Pipedream — all three workflows pick
> up the change automatically.

---

## Stage 2 — Set Script Properties

In the Apps Script editor go to
**Project Settings (gear icon) → Script Properties → Add script property**.

Set all properties listed in `.env.example` at the project root. The minimum
set required to run the booking-created flow end-to-end:

- [ ] `PIPEDREAM_SECRET` — a strong random string (must match `GAS_PIPEDREAM_SECRET` in Pipedream exactly)
- [ ] `SPREADSHEET_ID` — your Bookings spreadsheet ID
- [ ] `BOOKINGS_SHEET_NAME` — your Bookings sheet tab name (e.g. `Bookings`)
- [ ] `SENDGRID_API_KEY` — your SendGrid API key
- [ ] `SENDGRID_FROM_EMAIL` — the From address for outbound emails
- [ ] `SENDGRID_FROM_NAME` — the From display name for outbound emails
- [ ] `NOTIFICATION_EMAIL` — the internal address to receive booking notifications
- [ ] `INTAKE_FORM_PUBLIC_ID` — your Google Form public ID
- [ ] `INTAKE_FORM_EDIT_ID` — your Google Form edit ID
- [ ] `INTAKE_FORM_FIELD_FULL_NAME` — entry ID for the Full Name field
- [ ] `INTAKE_FORM_FIELD_PHONE_NUMBER` — entry ID for the Phone Number field
- [ ] `INTAKE_FORM_FIELD_UNIT_NUMBER` — entry ID for the Unit Number field
- [ ] `INTAKE_FORM_FIELD_EMAIL` — entry ID for the Email field
- [ ] `INTAKE_FORM_FIELD_REQUEST_TYPE` — entry ID for the Request Type field
- [ ] `INTAKE_FORM_FIELD_NOTES` — entry ID for the Notes field
- [ ] `INTAKE_FORM_FIELD_LOCATION` — entry ID for the Location field
- [ ] `DEFAULT_LOCATION` — reserved; unmapped bookings leave Location blank (not used for routing)
- [ ] `DEFAULT_LOCATION_GROUP` — reserved; unmapped bookings leave Location Group blank (not used for routing)

Set the remaining properties (`STRIPE_*`, `DOCUSEAL_*`) before testing
Stages 9 and 10. See `.env.example` for the complete list with descriptions.

**Expected result:** All properties are saved with no errors. The Apps Script
editor lists them under Script Properties.

---

## Stage 3 — Create the Pipedream Booking Created Workflow

- [ ] Log in to Pipedream and click **New Workflow**
- [ ] Name the workflow: `Booking — New Booking Created`
- [ ] Save the workflow (do not publish yet)

**Expected result:** An empty workflow canvas is open and saved.

---

## Stage 4 — Set the Pipedream Environment Variable

Before configuring steps, add both environment variables:

- [ ] Go to Pipedream **Settings → Environment Variables**
- [ ] Add variable: `GAS_WEB_APP_URL`
- [ ] Set the value to the Apps Script web app URL from Stage 1
      (e.g. `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`)
      Do **not** include `?source=pipedream` in the variable — it is appended in each step's URL field
- [ ] Add variable: `GAS_PIPEDREAM_SECRET`
- [ ] Set the value to the exact same string as `PIPEDREAM_SECRET` in Script Properties — they must match character-for-character (watch for trailing whitespace)

**Expected result:** Both `GAS_WEB_APP_URL` and `GAS_PIPEDREAM_SECRET` appear in
the environment variables list. Values are masked after saving (this is expected).

---

## Stage 5 — Configure the Google Calendar Trigger

- [ ] In the workflow, click **Add trigger**
- [ ] Select **Google Calendar**
- [ ] Select trigger event: **New Event**
- [ ] Connect your Google account if not already connected
- [ ] Select the calendar that receives Appointment Schedule bookings
      (find the Calendar ID under Calendar settings → Integrate calendar)
- [ ] Click **Save and continue**

**Expected result:** The trigger step shows as configured with your calendar.
Pipedream displays a sample event object in the trigger's output panel.

---

## Stage 6 — Add Step 1: extract_booking_fields

- [ ] Click **+** below the trigger to add a step
- [ ] Select **Run Node.js code**
- [ ] Rename the step to `extract_booking_fields`
- [ ] Paste the code from the **Step 1** section of
      `booking-workflow-reference.md`
- [ ] Update the `bookingSource` constant to match one of the keys in
      `CONFIG.LOCATION_MAP` in `Config.gs` (see the `bookingSource` note in
      the reference doc)
- [ ] Click **Test** to run the step against the sample trigger event

**Expected result:** The step output panel shows a JSON object with all fields
populated:
```json
{
  "email": "customer@example.com",
  "fullName": "Jane Smith",
  "phoneNumber": "555-0100",
  "unitNumber": "4B",
  "bookedDate": "2026-05-01",
  "bookedTime": "10:00",
  "calendarEventId": "abc123...",
  "bookingSource": "Your Booking Page Title"
}
```
If the step throws, check the error message — it will name the missing field
and print the raw event description.

---

## Stage 7 — Add Step 2: send_to_gas

- [ ] Click **+** below `extract_booking_fields` to add a step
- [ ] Select **HTTP Request**
- [ ] Rename the step to `send_to_gas`
- [ ] Set **Method:** POST
- [ ] Set **URL:** `{{process.env.GAS_WEB_APP_URL}}?source=pipedream`
- [ ] Set **Content-Type:** `application/json`
- [ ] Set the request body to:
      ```json
      {
        "eventType":       "booking.created",
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
- [ ] Click **Test** to send the request

**Expected result:** The step output shows HTTP 200 and a response body of:
```json
{ "received": true, "email": "customer@example.com" }
```
The customer email address should receive an intake form email within a few
seconds. A new row should appear in the Bookings sheet with status `Intake Sent`.

> Remember: GAS always returns HTTP 200 even for errors. Check the response body
> for `{"error":"..."}` if something looks wrong. See the reference doc for the
> full list of error response shapes.

---

## Stage 8 — End-to-End Booking Test

- [ ] Create a real test booking via your Google Appointment Schedules booking
      page using a test email address you can check
- [ ] Confirm the Calendar event is created with a guest matching your test email
      and a description containing `Phone:` and `Unit Number:` lines
- [ ] Wait up to 2 minutes for Pipedream to detect the new event
- [ ] Open Pipedream and confirm the workflow ran successfully
      (green checkmarks on all steps in the event inspector)
- [ ] Check the test email inbox for the intake form email
- [ ] Open the form link and confirm name is pre-filled; phone and unit are
      pre-filled only if provided at booking time; location is pre-filled only
      for single-location booking pages (Groups 1–3)
- [ ] Confirm a new row appears in the Bookings sheet with the correct location,
      name, email, date, time, and status `Intake Sent`

**Expected result:** Customer receives a correctly addressed intake form email.
The Bookings sheet shows all 21 columns populated correctly for the new row.

---

## Stage 9 — Verify Stripe Completion Forwarding

Before testing this stage, ensure all `STRIPE_*` Script Properties are set.

- [ ] Create the Stripe Completion Pipedream workflow as described in Part 2 of
      `booking-workflow-reference.md`
- [ ] Set the Pipedream HTTP source URL as the Stripe webhook endpoint in
      **Stripe Dashboard → Developers → Webhooks**
- [ ] Trigger a test payment using the Stripe Checkout link sent in a lock-cut
      email (you can use a Stripe test card)
- [ ] Confirm Pipedream receives the `checkout.session.completed` event and
      the `send_stripe_completion_to_gas` step returns `{"received":true}`
- [ ] Confirm the Bookings sheet row is updated: `Stripe Payment ID` is set,
      `Fee Paid` is `True`, and `Status` advances to `Pending Signature` (if
      DocuSeal is not yet complete) or `Confirmed` (if both are complete)

---

## Stage 10 — Verify DocuSeal Completion Forwarding

Before testing this stage, ensure all `DOCUSEAL_*` Script Properties are set.

- [ ] Create the DocuSeal Completion Pipedream workflow as described in Part 3
      of `booking-workflow-reference.md`
- [ ] Set the Pipedream HTTP source URL as the DocuSeal webhook endpoint in
      **DocuSeal → Settings → Webhooks**
- [ ] Sign the release form using the signing link sent in a lock-cut email
- [ ] Confirm Pipedream receives the `submission.completed` event and the
      `send_docuseal_completion_to_gas` step returns `{"received":true}`
- [ ] Confirm the Bookings sheet row is updated: `DocuSeal Document ID` is set,
      `Signature Complete` is `True`, and `Status` advances to `Pending Payment`
      (if Stripe is not yet complete) or `Confirmed` (if both are complete)
- [ ] If both Stripe and DocuSeal are now complete, confirm the customer received
      a final confirmation email and `Final Confirmation Sent` is `True`

---

## Troubleshooting

**`extract_booking_fields` throws "missing fields: fullName"**
`customer.displayName` is empty. The customer may have booked without a Google
account. Check the raw attendee object in the Pipedream trigger output. As a
fallback, parse `Name:` from the description — see the edge cases section in
`booking-workflow-reference.md`.

**`send_to_gas` response body contains `{"error":"Unauthorized"}`**
The `GAS_PIPEDREAM_SECRET` environment variable and the `PIPEDREAM_SECRET` Script
Property do not match. Re-copy both values and confirm they are
character-for-character identical (watch for trailing spaces or newlines).

**`send_to_gas` response body contains `{"error":"Missing required field: ..."}`**
A required field is empty or missing. Re-test Step 1 in isolation and confirm
all fields appear in its output before re-testing Step 2.

**`send_to_gas` returns an HTML page instead of JSON**
The `GAS_WEB_APP_URL` environment variable is wrong or the web app is not
deployed as "Anyone". Verify the URL in Apps Script under **Manage deployments**
and confirm access is "Anyone (even anonymous)". Also confirm `GAS_WEB_APP_URL`
does not include `?source=pipedream` — it is appended in each step's URL field.

**Location shows as empty or wrong in the Bookings sheet**
The `bookingSource` value sent by Pipedream does not match any key in
`CONFIG.LOCATION_MAP`. Check the GAS execution log for the warning
`bookingSource not matched in LOCATION_MAP`. Update `bookingSource` in
`extract_booking_fields` or add a new entry to `LOCATION_MAP` in `Config.gs`.

**Customer does not receive the intake form email**
Confirm the email address extracted by `extract_booking_fields` is correct.
Check that `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, and `NOTIFICATION_EMAIL`
are all set in Script Properties. Check the GAS execution log for
`EmailService.send` errors.

**Workflow did not trigger after booking**
Pipedream polls the Calendar API on a schedule (typically every 1–15 minutes on
free plans). Wait the full poll interval. If it still does not trigger, open the
Pipedream workflow, go to the trigger, and click **Refresh** to manually poll
for recent events.
