# Booking Workflow Live Test Checklist

End-to-end verification checklist for the Pipedream → Apps Script booking
integration. Work through each stage in order. Do not proceed to the next stage
until the expected result for the current one is confirmed.

Reference: `booking-workflow-reference.md`

---

## Stage 1 — Deploy the Apps Script Web App

- [ ] Open the Apps Script project in the editor
- [ ] Click **Deploy → Manage deployments → New deployment**
      (or edit the existing deployment if one already exists)
- [ ] Set **Execute as:** Me
- [ ] Set **Who has access:** Anyone (even anonymous)
- [ ] Set **Type:** Web app
- [ ] Click **Deploy** and copy the web app URL
- [ ] Save the URL — you will need it in Stage 4

**Expected result:** A URL in the form
`https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec` is available.
Visiting it in a browser returns `{"status":"ok"}`.

> If you make any code changes to the Apps Script project after this point,
> click **Manage deployments → Edit → Deploy** to update the same deployment.
> Creating a new deployment changes the URL.

---

## Stage 2 — Set Script Properties

In the Apps Script editor, go to
**Project Settings (gear icon) → Script Properties → Add script property**
and add the following keys:

- [ ] `PIPEDREAM_SECRET` — a strong random string you generate (keep a copy)
- [ ] `SPREADSHEET_ID` — your Google Sheets ID (if used; can be a placeholder for now)
- [ ] `INTAKE_FORM_ID` — your Google Form ID (can be a placeholder for now)
- [ ] `NOTIFICATION_EMAIL` — your email address

> `PIPEDREAM_SECRET` is the only property strictly required for this workflow.
> The others can be set to placeholder strings until those features are built.

**Expected result:** All properties are saved with no errors. The Apps Script
editor shows them listed under Script Properties.

---

## Stage 3 — Create the Pipedream Workflow

- [ ] Log in to Pipedream and click **New Workflow**
- [ ] Name the workflow: `Booking — Send Intake Form`
- [ ] Save the workflow (do not publish yet)

**Expected result:** An empty workflow canvas is open and saved.

---

## Stage 4 — Set the Pipedream Environment Variable

Before configuring steps, add the shared secret:

- [ ] Go to Pipedream **Settings → Environment Variables**
- [ ] Add variable: `GAS_PIPEDREAM_SECRET`
- [ ] Set the value to the exact same string you set for `PIPEDREAM_SECRET`
      in Script Properties — they must match character-for-character

**Expected result:** `GAS_PIPEDREAM_SECRET` appears in the environment variables
list. The value is not visible after saving (this is expected).

---

## Stage 5 — Configure the Google Calendar Trigger

- [ ] In the workflow, click **Add trigger**
- [ ] Select **Google Calendar**
- [ ] Select trigger event: **New Event**
- [ ] Connect your Google account if not already connected
- [ ] Select the calendar that receives Appointment Schedules bookings
      (find the Calendar ID under Calendar settings → Integrate calendar)
- [ ] Click **Save and continue**
- [ ] Pipedream will ask you to generate a test event — skip for now and
      use a real or mock event in Stage 7

**Expected result:** The trigger step shows as configured with your calendar.
Pipedream displays a sample event object in the trigger's output panel (it may
use a previously cached event).

---

## Stage 6 — Add Step 1: extract_booking_fields

- [ ] Click **+** below the trigger to add a step
- [ ] Select **Run Node.js code**
- [ ] Rename the step to `extract_booking_fields`
- [ ] Paste the full code from the **Step 1** section of
      `booking-workflow-reference.md`
- [ ] Click **Test** to run the step against the sample trigger event

**Expected result:** The step output panel shows a JSON object with all four
fields populated:
```json
{
  "email": "customer@example.com",
  "fullName": "Jane Smith",
  "phoneNumber": "555-0100",
  "unitNumber": "4B"
}
```
If the step throws, check the error message — it will name the missing field
and print the raw event description. See Troubleshooting below.

---

## Stage 7 — Add Step 2: send_to_gas

- [ ] Click **+** below `extract_booking_fields` to add a step
- [ ] Select **HTTP Request**
- [ ] Rename the step to `send_to_gas`
- [ ] Set **Method:** POST
- [ ] Set **URL:**
      `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec?source=pipedream`
      (replace `YOUR_DEPLOYMENT_ID` with the URL from Stage 1)
- [ ] Set **Content-Type:** `application/json`
- [ ] Set the request body to:
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
- [ ] Click **Test** to send the request

**Expected result:** The step output shows HTTP status 200 and a response body
of:
```json
{ "received": true, "email": "customer@example.com" }
```
The customer email address should receive an email with the pre-filled form
link within a few seconds.

---

## Stage 8 — End-to-End Booking Test

- [ ] Create a real test booking via your Google Appointment Schedules booking
      page using a test email address you can check
- [ ] Confirm the Calendar event is created with:
      - A guest matching your test email
      - A description containing `Phone:` and `Unit:` lines
- [ ] Wait up to 2 minutes for Pipedream to detect the new event
- [ ] Open Pipedream and confirm the workflow ran successfully
      (green checkmark on all steps in the event inspector)
- [ ] Check the test email inbox for the intake form email
- [ ] Open the link in the email and confirm the form fields are pre-filled
      with the correct name, phone, and unit

**Expected result:** The customer receives a correctly addressed email. The
embedded URL opens a Google Form with all three fields pre-populated. The
Pipedream event inspector shows all steps succeeded with no errors.

---

## Troubleshooting

**`extract_booking_fields` throws "missing fields: fullName"**
`customer.displayName` is empty. The customer may have booked without a Google
account. Check the raw attendee object in the Pipedream trigger output. As a
fallback, parse `Name:` from the description — see the edge cases section in
`booking-workflow-reference.md`.

**`extract_booking_fields` throws "missing fields: phoneNumber" or "unitNumber"**
The description does not contain a line matching `Phone:` or `Unit:`. Check the
raw description in the error output. Likely cause: the custom question label in
Appointment Schedules does not match the regex. Update the regex label in the
step code to match exactly.

**`send_to_gas` response body contains `{"error":"Unauthorized"}`**
The `GAS_PIPEDREAM_SECRET` environment variable and the `PIPEDREAM_SECRET`
Script Property do not match. Re-copy both values and confirm they are
character-for-character identical (watch for trailing spaces).

**`send_to_gas` response body contains `{"error":"Missing required field: ..."}`**
A field that `extract_booking_fields` was supposed to return is empty or missing.
Re-test Step 1 in isolation and confirm all four fields appear in its output
before re-testing Step 2.

**`send_to_gas` returns an HTML page instead of JSON**
The deployment URL is wrong or the web app is not deployed as "Anyone". Verify
the URL in Apps Script under **Manage deployments**, confirm access is set to
"Anyone (even anonymous)", and check that `?source=pipedream` is appended to
the URL in the step.

**Customer does not receive the email**
Confirm the email address extracted by `extract_booking_fields` is correct by
checking the step output. Check Gmail's Sent folder on the account that runs the
Apps Script to confirm the email was dispatched. If sent but not received, check
spam.

**Workflow did not trigger after booking**
Pipedream polls the Calendar API on a schedule (typically every 1–15 minutes on
free plans). Wait the full poll interval. If it still does not trigger, open the
Pipedream workflow, go to the trigger, and click **Refresh** to manually poll
for recent events.
