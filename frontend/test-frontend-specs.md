# ClinicSay Test Frontend Specification

**Status:** Draft

## 1. Purpose and scope

The test frontend is a local development tool in `frontend/` for exercising
the ClinicSay API through a browser. Flask renders the pages and calls the
Node.js API, which remains the source of truth for application behavior and
data. The frontend has its own Python dependencies and run instructions.
Normally all necessary endpoints are already present; the local management
and provider-simulator endpoints described below are additions to the
challenge's original OpenAPI contract.

## 2. Technology

- **Server:** Python with Flask
- **Views:** HTML rendered with Flask templates (Jinja)
- **Client-side behavior:** JavaScript only where needed for form and table
  interactions
- **API communication:** Flask sends HTTP requests to the API using a
  configurable base URL, defaulting to `http://localhost:3000`
- **Provider simulator:** Access it through the backend's `/admin/*` routes.
  The backend uses its configured `PROVIDER_URL` to reach the simulator.

Browser requests should go to Flask. Flask should call the API server-side,
keeping API integration in one client module and avoiding browser CORS
configuration.

## 3. Layout and visual style

Use [`frontend-layout.drawio`](frontend-layout.drawio) as the initial layout
reference. Keep the interface compact: avoid excessive padding, margins, and
vertical gaps. Keep table headers and actions visible and make the layout
usable on smaller screens.

Use semantic HTML, labels for form fields, keyboard-accessible dialogs, and
clear validation and error messages.

## 4. Main screen

The main screen contains these areas:

1. **Test clock:** A date and time selector with seconds (defaulting to `00`)
   and a button to set the backend clock.
2. **Reminder job:** A button to run due reminders and show the returned
   `processed` count.
3. **Reminders:** A table showing reminders returned by the reminder-list
   endpoint. Include an action column for sending simulated `SI` and `NO`
   replies.
4. **Appointments:** A table with appointment details and actions to view,
   reschedule, or cancel an appointment.
5. **Patients and clinics:** Tables or lists with forms for creating and
   editing records. The patient form includes an **Accepts reminders**
   dropdown with `true` selected by default.
6. **Refresh All:** A button to reload all records that the API can retrieve
   and refresh the views that depend on them.
7. **Provider simulator:** Use the dedicated section in the layout to inspect
   delivered messages and provider requests, and to reset simulator state.

Use a modal dialog for create and edit forms where the API supports those
operations. Require confirmation before cancellation or any supported delete
operation.

## 5. API behavior and available operations

The original challenge API contract is in [`../openapi.yaml`](../openapi.yaml).
The backend also exposes the following local management and simulator routes
for this frontend:

| Resource | Available operations | Frontend implication |
| --- | --- | --- |
| Clinics | `GET /clinics`, `POST /clinics`, `GET /clinics/{id}`, `PATCH /clinics/{id}`, `DELETE /clinics/{id}` | List, view, create, edit, and delete clinics. Deletion fails while patients or appointments reference the clinic; changing its timezone fails while appointments exist. |
| Patients | `GET /patients` (optional `clinicId` filter), `POST /patients`, `GET /patients/{id}`, `PATCH /patients/{id}`, `DELETE /patients/{id}` | List, view, create, edit, and delete patients. Deletion fails while appointments reference the patient. |
| Appointments | `GET /appointments` (optional `clinicId`, `patientId`, and `status` filters), `POST /appointments`, `GET /appointments/{id}`, `PATCH /appointments/{id}`, `POST /appointments/{id}/cancel` | List, view, create, reschedule, and cancel. Cancellation is the destructive action; appointments are not hard-deleted. |
| Reminders | `GET /reminders` (optional `clinicId`, `appointmentId`, and `status` filters); also returned as part of an appointment; process due reminders with `POST /jobs/reminders/run` | Refresh the reminders table from the collection endpoint. The job processes all reminders due at the backend clock time. |
| Inbound replies | Submit to `POST /webhooks/inbound-messages` | Simulated reply actions must send a unique `messageId`, the patient's phone as `from`, `SI` or `NO` as `text`, and a timezone-aware `receivedAt`. |
| Test clock | Set with `PUT /test/clock` when `CLOCK_MODE=test` | The clock value represents backend time and must be labeled UTC. This endpoint is unavailable outside test mode. |
| Provider simulator | Read `GET /admin/messages` and `GET /admin/requests`; reset with `POST /admin/reset` | These backend routes proxy to the configured provider simulator. Show delivered messages separately from all provider requests and their outcomes. Require confirmation before reset. |

**Refresh All** reloads clinics, patients, appointments, reminders, and both
provider views. Refresh dependent views after successful creates, edits,
reschedules, cancellations, replies, reminder runs, and deletes where
applicable. Handle constraint conflicts returned by clinic or patient deletes
as action errors.

The clock endpoint has no read operation. After the frontend sets the clock,
it may display the value it last submitted. On initial load, it must show the
clock value as unknown unless another supported source is added.

The provider simulator section must provide:

- A delivered-messages view backed by `GET /admin/messages`.
- A provider-requests view backed by `GET /admin/requests`, including each
  request's outcome.
- A **Reset provider simulator** action backed by `POST /admin/reset`. Show a
  confirmation dialog before resetting. Explain that this clears the
  simulator's delivered messages, request history, and configured response
  rules; it does not delete clinics, patients, appointments, or reminders from
  the ClinicSay database.
- A way to refresh both provider views after running the reminder job.

## 6. Time handling

Label the test clock as UTC and submit an ISO 8601 timestamp with a timezone,
for example `2027-12-14T10:00:00Z`. The seconds field defaults to `00`.

Appointment creation and rescheduling also require timezone-aware timestamps.
Use UTC for appointment date and time inputs and label them **UTC**. Convert
the chosen value to an ISO 8601 timestamp with `Z` before calling the API. Do
not submit a timezone-naive value.

## 7. Errors and feedback

- Display API validation and conflict errors beside the relevant form or
  action.
- Show loading and completion feedback for API calls.
- Prevent repeated submissions while a request is in progress.
- After a successful create, reschedule, cancellation, reply, or reminder run,
  refresh the affected view when the API allows it.
- Refresh all affected collections after successful mutations.

## 8. Local setup documentation

Add `frontend/README.md` with the Python version, environment setup, install
and run commands, API base URL configuration, and a short walkthrough for
creating records and triggering reminders. Document that the backend must be
running with `CLOCK_MODE=test` to use the clock control. Keep the tool local;
the API does not currently provide authentication.

## 9. Settled implementation choices

- Use the backend collection endpoints for **Refresh All** and the clinic,
  patient, appointment, and reminder views.
- Reply buttons submit simulated webhook messages to
  `POST /webhooks/inbound-messages`, with a new unique `messageId` for each
  action.
- Appointment date and time inputs use UTC, and requests carry timezone-aware
  ISO 8601 values.
- There is no database-reset endpoint. Cancel appointments, then remove
  patients and clinics when reference constraints allow it. Resetting the
  provider simulator clears only provider-side messages, requests, and rules.
