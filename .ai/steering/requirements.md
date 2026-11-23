The main reminder rules appears in @.ai\specs\reminder-rules.md

The product must implement the contract openapi.yaml

Even if not specified by that contract
create crud services for clinics, appointments, and patients.

As specified by @enunciado.pdf
create an environment variable with this setting
CLOCK_MODE=test

As specified by openapi.yaml, endpoint /test/clock
you can set the underlying system time
This is useful mainly for testing
but it also means that depending on that time
the creation, update times of entities will depend;
and certainly the calculations for the reminder functionality.





