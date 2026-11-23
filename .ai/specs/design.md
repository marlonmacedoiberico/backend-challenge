
Give instructions in the README.md on how to create the database using a docker image
Of course the database structure must be created

To manage the rescheduling of an appointment
- an appointment must have a version
- the reminder must have a field: appointmentVersion
  that saves the appointment version (of the creation
  or re-scheduling)

As of appointment desing:
@.ai\specs\appointment-version.md

The Docker compose must include our application with
the environment settings specified in  @docker-compose.yml

The backend must comply with Clean Architecture.
A layout example (for Python) appears in @.ai\specs\candidate-layout.md
