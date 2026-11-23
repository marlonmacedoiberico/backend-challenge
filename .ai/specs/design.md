
Give instructions in the README.md on how to create the database using a docker image
Of course the database structure must be created

To manage the rescheduling of an appointment
- an appointment has an internal version, initialized to `1` on creation
- each reschedule increments the version automatically
- each reminder stores the appointment version it was created for in
  `appointmentVersion`, allowing stale reminders to be identified
- both fields are persistence-only: clients do not send a version when
  creating appointments, and neither field is included in API responses

As of appointment desing:
@.ai\specs\appointment-version.md

The Docker compose must include our application with
the environment settings specified in  @docker-compose.yml

The backend must comply with Clean Architecture.
A layout example (for Python) appears in @.ai\specs\candidate-layout.md
