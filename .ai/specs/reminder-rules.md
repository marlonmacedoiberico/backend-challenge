## Cuándo sale el recordatorio  (when is the reminder sent?)

1. Cada cita tiene un recordatorio para su hora actual.
2. Sale a la misma hora local del día anterior, en la zona horaria de la clínica. Ten en cuenta que España cambia de hora el último domingo de marzo y el último de octubre, y que Canarias va una hora por detrás de la península. Por ejemplo, para una cita el domingo 28/03/2027 a las 10:00 en Madrid, el recordatorio sale el sábado 27/03/2027 a las 10:00 de Madrid (09:00 UTC), aunque entre uno y otro haya 23 horas.
3. Entre las 21:00 y las 09:00, hora de la clínica, no se envía el recordatorio inicial. Si la hora de envío cae en esa franja, pasa a las 09:00 siguientes. Los reintentos no esperan a que termine esa franja.
4. Si al crear o reprogramar la cita esa hora ya pasó, la hora de envío inicial es la actual, y se aplica igual la regla 3.
5. Si con todo eso la hora de envío no queda antes del inicio de la cita, el recordatorio se crea como `skipped`, con motivo `too_late`. Pasa lo mismo si al ir a enviarlo, también en un reintento, la cita ya empezó.
6. Si cuando le toca el paciente no tiene teléfono o no acepta recordatorios, queda `skipped` (`no_phone` u `opted_out`) y no se llama al proveedor.
7. El texto es exactamente este, con la fecha y la hora locales de la clínica (para copiarlo, está también en `openapi.yaml`):

   > Hola {nombre del paciente}, te recordamos tu cita en {nombre de la clínica} el {dd/MM/yyyy} a las {HH:mm}. Responde SI para confirmar o NO para cancelar.

8. Al reprogramar una cita, su recordatorio pendiente pasa a `cancelled` y se crea otro para la nueva hora, aunque el anterior ya se hubiera enviado. Si la cita estaba confirmada vuelve a `scheduled`, porque se había confirmado la hora anterior.
9. Al cancelar una cita se cancela su recordatorio pendiente.
