# ClinicSay Test Frontend Specification

**Status:** Draft

## 1. Purpose and scope

The test frontend is a local development tool for exercising the ClinicSay API
through a browser. It will use Flask to render HTML pages and call the existing
Node.js API. The API remains the source of truth for application behavior and
data.

The frontend is not part of the evaluated backend API and must not add or
change API operations. Keep it in the `frontend/` directory with its own
Python dependencies and run instructions.

## 2. Technology

- **Server:** Python with Flask
- **Views:** HTML rendered with Flask templates (Jinja)
- **Client-side behavior:** JavaScript only where needed for form and table
  interactions
- **API communication:** Flask sends HTTP requests to the API using a
  configurable base URL, defaulting to `http://localhost:3000`
- **Provider simulator:** Flask uses a separate configurable base URL,
  defaulting to `http://localhost:4010`

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
3. **Reminders:** A table showing reminders for appointments known to the
   frontend. Include an action column for sending simulated `SI` and `NO`
   replies.
4. **Appointments:** A table with appointment details and actions to view,
   reschedule, or cancel an appointment.
5. **Patients and clinics:** Tables or lists with forms for creating records.
   The patient form includes an **Accepts reminders** dropdown with `true`
   selected by default.
6. **Refresh All:** A button to reload all records that the API can retrieve
   and refresh the views that depend on them.
7. **Provider simulator:** Use the dedicated section in the layout to inspect
   delivered messages and provider requests, and to reset simulator state.

Use a modal dialog for create and edit forms where the API supports those
operations. Require confirmation before cancellation or any supported delete
operation.

## 5. API behavior and current limitations

The frontend must follow [`../openapi.yaml`](../openapi.yaml). The current API
supports these operations:

| Resource | Available operations | Frontend implication |
| --- | --- | --- |
| Clinics | Create with `POST /clinics` | No list, read, edit, or delete operation is available. |
| Patients | Create with `POST /patients` | No list, read, edit, or delete operation is available. |
| Appointments | Create, read by ID, reschedule, and cancel | No list operation or hard-delete operation is available. Treat the appointment's destructive action as **Cancel**, not Delete. |
| Reminders | Returned as part of an appointment; process due reminders with `POST /jobs/reminders/run` | There is no reminder-list endpoint. The job processes all reminders due at the backend clock time. |
| Inbound replies | Submit to `POST /webhooks/inbound-messages` | Simulated reply actions must send a unique `messageId`, the patient's phone as `from`, `SI` or `NO` as `text`, and a timezone-aware `receivedAt`. |
| Test clock | Set with `PUT /test/clock` when `CLOCK_MODE=test` | The clock value represents backend time and must be labeled UTC. This endpoint is unavailable outside test mode. |
| Provider simulator | Read `GET /admin/messages` and `GET /admin/requests`; reset with `POST /admin/reset` | Show delivered messages separately from all provider requests and their outcomes. Require confirmation before reset. |

Because clinics and patients cannot be fetched, and appointments cannot be
listed, **Refresh All cannot reload all records from the current API**. The
frontend may refresh appointment details for IDs it already knows, but a full
refresh requires collection read endpoints. Clinic and patient editing or
deletion also requires API support. Do not present these actions as working
until the API contract supports them.

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
Before implementation, decide whether the form accepts UTC or clinic-local
date and time. Label the chosen timezone and convert the value to an ISO 8601
timestamp with an offset before calling the API. Do not submit a timezone-naive
value.

## 7. Errors and feedback

- Display API validation and conflict errors beside the relevant form or
  action.
- Show loading and completion feedback for API calls.
- Prevent repeated submissions while a request is in progress.
- After a successful create, reschedule, cancellation, reply, or reminder run,
  refresh the affected view when the API allows it.
- Explain when a view cannot be refreshed because the API has no read endpoint.

## 8. Local setup documentation

Add `frontend/README.md` with the Python version, environment setup, install
and run commands, API base URL configuration, and a short walkthrough for
creating records and triggering reminders. Document that the backend must be
running with `CLOCK_MODE=test` to use the clock control. Keep the tool local;
the API does not currently provide authentication.

## 9. Decisions needed before implementation

1. Should this remain a test frontend for the existing API, or should the API
   contract be expanded to support full clinic, patient, and appointment
   management? The current backend design keeps clinics and patients
   creation-only and does not provide collection listing.
2. Should Refresh All cover only appointments known to the frontend, or should
   collection endpoints be added through a separate product decision?
3. Should the reply buttons submit simulated webhook messages, or should the
   frontend only display replies received from the messaging provider?
4. Should appointment date and time inputs use UTC or the clinic's timezone?
5. How should test records be reset or cleaned up? The API has no delete
   operations for clinics or patients and no database-reset endpoint.
