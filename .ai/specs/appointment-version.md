An appointment version is a counter that changes whenever the appointment is rescheduled. Each reminder records the version it was created for, so the system can distinguish reminders for the current appointment time from reminders for an older time.

For example:

- Appointment A1 is at 10:00, version 1. Its reminder is also version 1.
- The appointment is moved to 11:00, so it becomes version 2. A new version 2 reminder is created.
- If an old version 1 reminder is still queued, the system can recognize it as stale and avoid sending it.

It’s one way to prevent an outdated reminder from being sent after rescheduling. Another design is to cancel the old reminder and rely on its status, without storing a version. The version is helpful when you need an extra check that a reminder still matches the appointment’s current schedule.