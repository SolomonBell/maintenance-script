# Manager Guide

**Who this is for:** Reliable Storage managers and supervisors
**Reading time:** ~15 minutes

> **Video walkthrough:** [Manager Walkthrough — Maintenance Script](https://youtu.be/v4nrowu-jsk)
> A short screen recording covering the Bookings sheet, request statuses, and manager workflow.

---

## Table of Contents

1. [What This System Does](#1-what-this-system-does)
2. [Tools Involved](#2-tools-involved)
3. [End-to-End Customer Flow](#3-end-to-end-customer-flow)
4. [Email and Notification System](#4-email-and-notification-system)
5. [The Bookings Sheet Explained](#5-the-bookings-sheet-explained)
6. [Status Values — What Each One Means](#6-status-values--what-each-one-means)
7. [Location System](#7-location-system)
8. [Manager Daily Workflow](#8-manager-daily-workflow)
9. [Troubleshooting](#9-troubleshooting)
10. [Safe Editing Rules](#10-safe-editing-rules)

---

## 1. What This System Does

When a customer submits a maintenance request online, this system automatically:

- Records the booking in a Google Sheet
- Emails the customer a personalized intake form to fill out
- Reads the customer's form responses and updates the booking record
- Sends the customer a confirmation email
- For lock cut requests: collects payment via Stripe and a signed release form via DocuSeal before confirming

**You do not need to send any emails manually.** Every customer-facing message and every internal notification is handled automatically by the system.

Your job is to:
- Check the Google Sheet and Calendar for new and upcoming requests
- Show up and complete the maintenance work
- Mark jobs as **Completed** when finished

---

## 2. Tools Involved

| Tool | What It Does in This System |
|---|---|
| **Google Calendar / Appointment Schedules** | Customers book their appointment here. Each Reliable Storage location has its own booking page. |
| **Pipedream** | Detects new bookings in Google Calendar and forwards the booking details into the system. Think of it as the bridge between Google Calendar and everything else. |
| **Google Apps Script** | The brain of the system. Receives booking data from Pipedream, reads form responses, sends emails, and updates the sheet. |
| **Google Sheets** | The master log of all bookings. Every row is one booking. Managers use this to track status and check details. |
| **Google Forms** | The intake form customers fill out after booking. Their answers update the booking row in Google Sheets automatically. |
| **SendGrid** | The email delivery service. Every email the system sends — to customers and to managers — goes through SendGrid. It is not Gmail. |
| **Stripe** | Handles the lock cut fee payment. Customers pay through a Stripe-hosted checkout page. |
| **DocuSeal** | Handles the lock cut release authorization form. Customers sign digitally through a DocuSeal-hosted signing page. |

**Important:** DocuSeal's own built-in emails are deliberately disabled. The system controls all customer communication through SendGrid so that customers never receive duplicate messages.

---

## 3. End-to-End Customer Flow

### Standard Maintenance Request (No Lock Cut)

| Step | Who Does It | What Happens |
|---|---|---|
| 1 | Customer | Books an appointment on the Reliable Storage booking page in Google Calendar |
| 2 | System (Pipedream + Apps Script) | Detects the new booking; records it in the Bookings sheet with status **Intake Sent** |
| 3 | System (SendGrid) | Emails the customer a pre-filled intake form link |
| 4 | System (SendGrid) | Emails an internal notification to the manager inbox: "New Booking" |
| 5 | Customer | Opens the intake form email and submits the form (request type, unit number, notes) |
| 6 | System (Apps Script) | Reads the form responses; updates the booking row in the sheet; sets status to **Form Submitted** |
| 7 | System (SendGrid) | Emails the customer a confirmation with the appointment date, time, and location |
| 8 | System (SendGrid) | Emails an internal notification to the manager inbox: "Confirmed" |
| 9 | System (Apps Script) | Sets status to **Confirmed** and marks Final Confirmation Sent = True |
| 10 | Manager | Shows up at the appointment; marks status to **Completed** when done |

### Lock Cut Request

Lock cuts follow the same steps 1–6 above. At step 6, the system detects that the request type contains the word "lock" and switches to a different path:

| Step | Who Does It | What Happens |
|---|---|---|
| 7 | System (Apps Script) | Creates a Stripe payment link and a DocuSeal signing link simultaneously |
| 8 | System (Apps Script) | Sets status to **Pending Payment + Signature**; marks Fee Required = True, Signature Required = True |
| 9 | System (SendGrid) | Emails the customer a single "Action Required" email with both links (payment and signing) |
| 10 | System (SendGrid) | Emails an internal notification to the manager inbox: "Pending" |
| 11 | Customer | Pays the lock cut fee through the Stripe link |
| 12 | System (Stripe + Pipedream + Apps Script) | Records payment; writes Stripe Payment ID; sets Fee Paid = True |
| 13 | Customer | Signs the release form through the DocuSeal link |
| 14 | System (DocuSeal + Pipedream + Apps Script) | Records signature; writes Docuseal Document ID; sets Signature Complete = True |
| 15 | System (Apps Script) | Once **both** Fee Paid and Signature Complete are True: sends final confirmation email and manager notification; sets status to **Confirmed** |
| 16 | Manager | Shows up at the appointment; marks status to **Completed** when done |

Steps 11–14 (payment and signing) can happen in either order. The final confirmation only goes out once both are complete.

---

## 4. Email and Notification System

All emails — to customers and to managers — are sent by **SendGrid**, not Gmail. They come from the address set up in the system configuration (`SENDGRID_FROM_EMAIL`).

The manager inbox that receives internal notifications is the address in the `NOTIFICATION_EMAIL` system setting. This is a single address; only one manager inbox receives these notifications.

### Email 1 — Intake Form (to customer)

| | |
|---|---|
| **Who receives it** | The customer who booked the appointment |
| **When it is sent** | As soon as Pipedream detects and forwards the new booking to the system. Pipedream polls Google Calendar on a schedule, so there is typically a short delay of a few minutes between when the customer books and when this email is sent. |
| **What triggers it** | A new Google Calendar booking event detected by Pipedream |
| **What it is for** | Asks the customer to complete the intake form so the team knows the request details |
| **What it contains** | A personalized link to the Google intake form, pre-filled with the customer's name and email (and phone/unit if provided at booking time; location if it is a single-location booking page) |
| **Action needed** | Customer must open the link and submit the form |

### Email 2 — New Booking Notification (to manager inbox)

| | |
|---|---|
| **Who receives it** | The internal manager inbox (`NOTIFICATION_EMAIL`) |
| **When it is sent** | At the same time as Email 1 |
| **What triggers it** | Same: a new booking forwarded from Pipedream |
| **What it is for** | Lets the manager know a new request has come in and the intake form has been sent to the customer |
| **What it contains** | Customer name, email, phone (if collected), unit (if collected), location, location group, booked date and time, and status: Intake Sent |
| **Action needed** | None required. This is for awareness only. |

### Email 3 — Appointment Confirmation (to customer, standard requests only)

| | |
|---|---|
| **Who receives it** | The customer |
| **When it is sent** | After the customer submits the intake form and the request type does **not** contain the word "lock" |
| **What triggers it** | The customer submitting the Google intake form |
| **What it is for** | Confirms the appointment is set; no further action needed from the customer |
| **What it contains** | Appointment date, time, location, and unit number (if available). Message: "No further action is required on your end." |
| **Action needed** | None — this is a confirmation only |

### Email 4 — Confirmed Notification (to manager inbox, standard requests only)

| | |
|---|---|
| **Who receives it** | The internal manager inbox |
| **When it is sent** | At the same time as Email 3 |
| **What triggers it** | The customer submitting the intake form (non-lock-cut) |
| **What it is for** | Lets the manager know a standard request is now fully confirmed |
| **What it contains** | Customer name, email, phone, unit, location, location group, request type, date/time, notes (if any), Fee Required: False, Signature Required: False, Status: Confirmed |
| **Action needed** | Manager should plan to be available for the appointment |

### Email 5 — Action Required: Payment + Signature (to customer, lock cut only)

| | |
|---|---|
| **Who receives it** | The customer |
| **When it is sent** | After the customer submits the intake form and the request type **does** contain the word "lock" |
| **What triggers it** | The customer submitting the intake form with a lock cut request type |
| **What it is for** | Tells the customer they must complete both a payment and a signing before the appointment is confirmed |
| **What it contains** | A Stripe payment link for the lock cut fee and a DocuSeal signing link for the release authorization form |
| **Action needed** | Customer must complete **both** — the payment link and the signing link — before the appointment is confirmed. They can do these in either order. |

> **Note:** DocuSeal's own built-in email notifications are disabled. The customer's only notification about the signing form is this email. If they miss or lose this email, they will need to be resent the signing link by the person who manages the system.

### Email 6 — Pending Notification (to manager inbox, lock cut only)

| | |
|---|---|
| **Who receives it** | The internal manager inbox |
| **When it is sent** | At the same time as Email 5 |
| **What triggers it** | The customer submitting the intake form with a lock cut request type |
| **What it is for** | Lets the manager know a lock cut is pending and waiting for the customer to pay and sign |
| **What it contains** | Customer name, email, phone, unit, location, location group, request type, notes (if any), Fee Required: True, Fee Paid: False, Signature Required: True, Signature Complete: False, Status: Pending Payment + Signature |
| **Action needed** | No action yet. Wait for the customer to complete payment and signing. The system will send another notification when both are done. |

### Email 7 — Final Confirmation (to customer, lock cut only)

| | |
|---|---|
| **Who receives it** | The customer |
| **When it is sent** | After **both** the Stripe payment and DocuSeal signature are recorded as complete |
| **What triggers it** | The system detecting that Fee Paid = True and Signature Complete = True simultaneously |
| **What it is for** | Confirms the lock cut appointment is fully set and no further action is needed |
| **What it contains** | Appointment date, time, location, and unit number. Message: "No further action is required on your end." |
| **Action needed** | None — this is a final confirmation only |

### Email 8 — Confirmed Notification (to manager inbox, lock cut only)

| | |
|---|---|
| **Who receives it** | The internal manager inbox |
| **When it is sent** | At the same time as Email 7 |
| **What triggers it** | Both payment and signature completing |
| **What it is for** | Lets the manager know a lock cut is fully confirmed and ready to schedule |
| **What it contains** | Customer name, email, phone, unit, location, location group, request type, date, time, Fee Paid: True, Signature Complete: True, Status: Confirmed |
| **Action needed** | Manager should plan to be available for the lock cut appointment |

### What Does NOT Trigger an Email

The following events update the Bookings sheet silently with no email sent:

- **Stripe payment alone completes** (before the signature): The sheet is updated (Stripe Payment ID written, Fee Paid = True, status → Pending Signature), but no email is sent to anyone. The final confirmation goes out only after both steps are complete.
- **DocuSeal signature alone completes** (before payment): The sheet is updated (Docuseal Document ID written, Signature Complete = True, status → Pending Payment), but no email is sent. Same reason.

---

## 5. The Bookings Sheet Explained

Each row in the Bookings sheet is one customer booking. Here is what every column means:

| Column | What It Contains | Written By |
|---|---|---|
| **Timestamp** | The date and time the booking was first received by the system | System, automatically |
| **Location** | The Reliable Storage location for this booking (e.g., Bainbridge, Poulsbo) | System at booking; customer can confirm on intake form |
| **Location Group** | An internal grouping used to identify which calendar/booking page the request came from (Group 1 through Group 5) | System, automatically |
| **First Name** | Customer's first name | System, automatically |
| **Last Name** | Customer's last name | System, automatically |
| **Phone** | Customer's phone number | System at booking (if provided); updated when customer submits intake form |
| **Email** | Customer's email address | System, automatically |
| **Unit Number** | The customer's storage unit number | System at booking (if provided); updated when customer submits intake form |
| **Request Type** | What the customer needs done (e.g., "General Maintenance" or "Lock Cut") | Customer (via intake form) |
| **Booked Date** | The appointment date the customer selected | System, automatically |
| **Booked Time** | The appointment time the customer selected | System, automatically |
| **Notes** | Any additional notes the customer entered on the intake form | Customer (via intake form) |
| **Status** | Where this booking is in the process right now | System (see Section 6) |
| **Fee Required** | True if a lock cut fee is required; False otherwise | System, automatically |
| **Fee Paid** | True once the customer's Stripe payment is confirmed | System, automatically |
| **Signature Required** | True if a DocuSeal release form signature is required; False otherwise | System, automatically |
| **Signature Complete** | True once the customer's DocuSeal signature is confirmed | System, automatically |
| **Calendar Event ID** | Internal identifier linking this booking to the Google Calendar event | System, automatically |
| **Stripe Payment ID** | The Stripe Checkout Session ID, recorded when payment is confirmed | System, automatically |
| **Docuseal Document ID** | The DocuSeal submission ID, recorded when the release form is signed | System, automatically |
| **Final Confirmation Sent** | True once the final appointment confirmation email has been sent to the customer | System, automatically |

### What to look at day-to-day

Focus on these columns when reviewing the sheet each morning:

- **Status** — the quickest summary of where each booking stands
- **Booked Date / Booked Time** — to plan your schedule
- **Location** — to confirm you are looking at the right site
- **Request Type** — to know whether the job is a standard request or a lock cut
- **Fee Paid / Signature Complete** — for lock cuts, to see if both steps are done
- **Notes** — any customer notes that might affect the work

---

## 6. Status Values — What Each One Means

| Status | Meaning | Does the customer still need to act? | Does the manager need to act? |
|---|---|---|---|
| **Intake Sent** | New booking received. The system has emailed the customer an intake form. | Yes — customer needs to submit the intake form | No — wait for the customer to submit |
| **Form Submitted** | The customer has submitted the intake form. The system is processing the response. | No (transition state, brief) | No — system handles next steps automatically |
| **Pending Payment + Signature** | Lock cut: the customer has been sent both a payment link and a signing link. Neither is complete yet. | Yes — customer must pay AND sign | No — wait; the system will update automatically |
| **Pending Payment** | Lock cut: the signature is complete but the payment has not been received yet. | Yes — customer still needs to pay | No — wait; the system will update automatically |
| **Pending Signature** | Lock cut: the payment is complete but the release form has not been signed yet. | Yes — customer still needs to sign | No — wait; the system will update automatically |
| **Confirmed** | All requirements are met. The final confirmation email has been sent to the customer. The appointment is ready. | No | Yes — show up and complete the work |
| **Completed** | The appointment has taken place. | No | Manager should mark this manually when work is done |

---

## 7. Location System

Reliable Storage has multiple locations. Each location has its own booking page in Google Calendar.

When a customer books, the booking page title is sent to the system. The system uses this title to look up the correct location name and location group. Here is the current mapping:

| Booking Page | Location | Group |
|---|---|---|
| Bainbridge Maintenance | Bainbridge | Group 1 |
| Poulsbo Maintenance | Poulsbo | Group 2 |
| Port Orchard Maintenance | Port Orchard | Group 3 |
| Kingston & Silverdale Maintenance | Kingston / Silverdale | Group 4 |
| Fairgrounds & Waaga Way Maintenance | Fairgrounds / Waaga Way | Group 5 |

**Groups 1–3** are single-location pages. The system automatically pre-fills the location on the customer's intake form.

**Groups 4–5** serve two sites each. The system cannot pre-fill a single location, so the customer selects their specific location on the intake form.

If the system cannot match a booking to a known location, the Location and Location Group columns are left blank. The booking is still created and the customer still receives the intake form, but a manager or the system administrator will need to manually add the location to the sheet row.

---

## 8. Manager Daily Workflow

### Each morning

1. **Open the Bookings sheet.** Bookmark the link for quick access.
2. **Filter or scroll by Booked Date** to find today's and tomorrow's appointments.
3. **Check the Status column** for any rows that need attention.
4. **Look for lock cuts in "Pending" statuses.** If a lock cut has been Pending Payment or Pending Signature for more than a day or two, escalate to the person who manages the system. The customer may need a reminder.

### At each appointment

- Show up at the scheduled time and location.
- Confirm unit number with the customer if needed.
- Complete the maintenance work.
- When finished, **change the Status column to "Completed"** in the Bookings sheet.

### What you do NOT need to do

- Send intake form emails (the system handles this)
- Send payment or signing links (the system handles this)
- Send confirmation emails (the system handles this)
- Track payment or signature status manually (the system updates this)

---

## 9. Troubleshooting

Use this section when something looks wrong. Most issues are quick to diagnose if you know where to look.

---

**Customer says they did not receive the intake form email**

Check the row in the Bookings sheet. If Status is "Intake Sent," the system sent the email. Ask the customer to check their spam folder. The email comes from the Reliable Storage sending address (not a personal Gmail), so it may land in spam.

If there is no row at all for this customer, the booking may not have reached the system. The booking trigger in Pipedream may have missed it. Let the system administrator know.

---

**Customer submitted the intake form but the sheet did not update**

The form submission trigger looks up the booking row by the email address the customer entered on the form. If the email on the form does not exactly match the email in the sheet, the row will not be updated.

Check the sheet for that customer and compare the email. Also confirm that Status is still "Intake Sent" — if it already moved forward, the form did process correctly.

If the sheet row was not updated and the emails match, let the system administrator know. A trigger may have failed.

---

**Payment completed but status did not update to Pending Signature or Confirmed**

Stripe notifies the system through Pipedream. If the Pipedream workflow failed, the payment will have been collected but the sheet will not reflect it.

Look at the Stripe Payment ID column for this row. If it is blank and the customer says they paid, let the system administrator know to check Pipedream and the Stripe webhook logs.

---

**Signature completed but status did not update to Pending Payment or Confirmed**

Same as above, but for DocuSeal. If the Docuseal Document ID column is blank after the customer says they signed, let the system administrator know to check Pipedream and the DocuSeal webhook.

---

**Status is Pending Payment or Pending Signature for more than a couple of days**

The customer completed one step but not the other. If payment is done but the signature is not (or vice versa), the appointment will not be confirmed until the missing step is complete.

If the customer has lost their email with the links, the system administrator can resend or retrieve the links. Do not attempt to manually move the status to Confirmed — the system tracks both conditions and the final confirmation email will not have been sent.

---

**Booking went to the wrong location or Location is blank**

This happens when the booking page title sent by the system does not match any known location. The booking is still valid, but the Location column will be empty.

Manually enter the correct location in the Location and Location Group columns if you know which site the customer intended. Let the system administrator know so they can investigate whether the location mapping needs to be updated.

---

**Final confirmation did not send**

For standard requests: if the customer submitted the intake form and the status is Confirmed but they say they never received a confirmation, check the SendGrid account for delivery errors. The email address on file may have a typo.

For lock cuts: the final confirmation only goes out after both payment AND signature are complete. If either one is missing, the confirmation has not been sent yet, and the status will still show a Pending state. Do not send a manual confirmation — wait for the system to do it once both steps are complete.

---

**Manager notifications stopped arriving**

Internal notifications go to one configured email address. If that inbox stopped receiving them, check:
- That your spam filter is not catching them
- That the sending email address is still allowed by your email provider

Let the system administrator know if notifications seem to have stopped entirely — the `NOTIFICATION_EMAIL` setting may need to be updated.

---

**You do not see a booking you were expecting**

Pipedream polls Google Calendar on a schedule (typically every 1–15 minutes on a standard plan). There may be a short delay after a booking is made. Wait a few minutes, then refresh the sheet.

If the booking still does not appear after 15 minutes, the Pipedream trigger may have missed it. Let the system administrator know.

---

## 10. Safe Editing Rules

Managers can and should edit certain things in the sheet. Other columns are managed entirely by the system and should be left alone unless a system administrator is actively troubleshooting.

### Safe to edit manually

| Column | Why it is safe |
|---|---|
| **Status** | Set to **Completed** when a job is finished. This is the one column managers are expected to update manually after each appointment. |
| **Notes** | Add context about the job outcome or any issues encountered. |
| **Location** | Correct a blank or wrong location if you know the right one. |

### Do not edit unless troubleshooting

| Column | Why to leave it alone |
|---|---|
| **Fee Paid** | Set automatically when Stripe confirms payment. Editing this will not generate the final confirmation email — it only changes the displayed value. |
| **Signature Complete** | Same as Fee Paid — set automatically by DocuSeal. Manually changing it does not trigger the confirmation flow. |
| **Stripe Payment ID** | A unique identifier the system uses to link this row to a specific Stripe transaction. Editing it can break payment reconciliation. |
| **Docuseal Document ID** | Same — links to a specific DocuSeal submission. |
| **Calendar Event ID** | Internal link to the Google Calendar booking event. Leave as-is. |
| **Final Confirmation Sent** | Tracks whether the final email went out. Changing it does not resend the email. |
| **Fee Required / Signature Required** | Set by the system based on the customer's intake form responses. |
| **Timestamp** | The original record of when the booking was received. Do not alter. |

> **Rule of thumb:** If the column is filled in automatically by the system, leave it alone. If you see something wrong in a system-managed column, contact the system administrator rather than editing it yourself.

---

*Last updated: May 2026*
