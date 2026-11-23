# Prueba técnica de backend

**ClinicSay · noviembre de 2026**

ClinicSay es un software de gestión para clínicas de España. Cuando un paciente no se presenta, la clínica pierde ese hueco. Para evitarlo, cada cita se recuerda por mensaje el día anterior y el paciente puede confirmarla o cancelarla respondiendo. Eso es lo que vas a construir.

Se parece bastante al trabajo del día a día: procesos que corren solos, dependen de proveedores externos que fallan y no se pueden equivocar de hora ni mandar el mismo mensaje dos veces.

El repositorio de partida es <https://github.com/clinicsay/backend-challenge>. Tiene el contrato de la API (`openapi.yaml`), el proveedor de mensajes simulado (`provider/`) y el `docker-compose.yml` inicial.

## Antes de empezar

Está pensada para 3 o 4 horas de trabajo, y tienes 48 horas para hacerla cuando mejor te venga: la entrega es hasta el miércoles 25 de noviembre de 2026 a las 17:30 de Madrid (11:30 en Lima). Si no te da para todo, prioriza y cuenta en el README qué dejaste fuera y por qué; eso también cuenta.

Para entregar, deja el enlace de tu repositorio en el formulario de entrega, que también está en el README del repositorio de partida. Se cierra a esa hora, y se evalúa el último commit que hayas subido antes de ella.

Las dudas se resuelven en el Zoom. Si después algo no te queda claro, decide tú y cuéntalo en el README.

Puedes usar IA (Copilot, Cursor, Claude, ChatGPT o lo que uses normalmente), pero el código es tuyo: en la entrevista vas a explicarlo, cambiarlo en directo y arreglar un fallo, y una parte es sin IA.

El stack es Node.js 22 o superior, TypeScript y PostgreSQL. El framework, las librerías y la estructura los eliges tú.

Es individual. Trabaja en un repositorio público de GitHub con tu historial real de commits, no un solo commit al final. Puedes crearlo desde el repositorio de partida con “Use this template” o clonarlo y subirlo a un repositorio tuyo.

## Lo que hay que construir

Una API con clínicas, pacientes y citas, cuyo contrato está en `openapi.yaml`, y todo lo que pasa alrededor de cada cita.

## Cuándo sale el recordatorio

1. Cada cita tiene un recordatorio para su hora actual.
2. Sale a la misma hora local del día anterior, en la zona horaria de la clínica. Ten en cuenta que España cambia de hora el último domingo de marzo y el último de octubre, y que Canarias va una hora por detrás de la península. Por ejemplo, para una cita el domingo 28/03/2027 a las 10:00 en Madrid, el recordatorio sale el sábado 27/03/2027 a las 10:00 de Madrid (09:00 UTC), aunque entre uno y otro haya 23 horas.
3. Entre las 21:00 y las 09:00, hora de la clínica, no se envía nada. Si la hora de envío cae en esa franja, pasa a las 09:00 siguientes.
4. Si al crear o reprogramar la cita esa hora ya pasó, la hora de envío es la actual, y se aplica igual la regla 3.
5. Si con todo eso la hora de envío no queda antes del inicio de la cita, el recordatorio se crea como `skipped`, con motivo `too_late`. Pasa lo mismo si al ir a enviarlo, también en un reintento, la cita ya empezó.
6. Si cuando le toca el paciente no tiene teléfono o no acepta recordatorios, queda `skipped` (`no_phone` u `opted_out`) y no se llama al proveedor.
7. El texto es exactamente este, con la fecha y la hora locales de la clínica (para copiarlo, está también en `openapi.yaml`):

   > Hola {nombre del paciente}, te recordamos tu cita en {nombre de la clínica} el {dd/MM/yyyy} a las {HH:mm}. Responde SI para confirmar o NO para cancelar.

8. Al reprogramar una cita, su recordatorio pendiente pasa a `cancelled` y se crea otro para la nueva hora, aunque el anterior ya se hubiera enviado. Si la cita estaba confirmada vuelve a `scheduled`, porque se había confirmado la hora anterior.
9. Al cancelar una cita se cancela su recordatorio pendiente.

## Cómo se envía

Los recordatorios los envía una pasada que se lanza con `POST /jobs/reminders/run`. La pasada trata todos los que tocan según el reloj del servicio y responde cuando termina. En producción la lanzaría un cron cada minuto; aquí la lanzan los tests de la evaluación.

Puede haber varias pasadas a la vez, como si el servicio corriera en varias instancias, y aun así cada recordatorio se envía una sola vez y el proveedor no recibe dos llamadas para el mismo intento.

El proveedor de mensajes (el servicio `provider`, con su código en `provider/server.mjs`) falla como los de verdad:

| Respuesta | Qué significa | Qué hacer |
|---|---|---|
| `202` o `200` | Entregado (con `200`, ya lo tenía y no lo reenvía) | Queda `sent` |
| `503` | No se entregó | Reintentar |
| `504`, error de red o más de 5 s sin respuesta | Puede que se haya entregado | Reintentar sin que el paciente lo reciba dos veces |
| `422` | Rechazado | Queda `failed`, sin reintentos |

Si al proveedor le llega otra vez la misma cabecera `Idempotency-Key`, no reenvía el mensaje.

El segundo intento va 1 minuto después del primer fallo y el tercero, 5 minutos después del segundo. Si el tercero también falla, el recordatorio queda `failed`. Los reintentos no esperan a que termine la franja de 21:00 a 09:00.

## Las respuestas del paciente

Cuando un paciente responde, el proveedor llama a `POST /webhooks/inbound-messages`.

`SI` confirma la cita y `NO` la cancela, junto con su recordatorio pendiente. Da igual que venga en mayúsculas o minúsculas, con tilde o con espacios y signos alrededor (`Sí`, `si.`, `NO!`). Cualquier otro texto se ignora.

La respuesta se aplica a la cita que recibió el último recordatorio enviado a ese teléfono, entre las que no han empezado ni están canceladas; puede haber varios pacientes con el mismo número, por ejemplo en una familia. Si no hay ninguna, se ignora.

El proveedor puede mandar el mismo aviso más de una vez, con el mismo `messageId`, y solo se procesa la primera. El webhook responde `200` aunque ignore el mensaje, porque si responde un error el proveedor lo vuelve a mandar.

## El reloj

Para poder probar con fechas, el servicio arranca con `CLOCK_MODE=test`, y en ese modo `PUT /test/clock` fija la hora que usa para todo: crear citas, las pasadas y los webhooks. Sin ese modo, el endpoint no existe.

No hace falta autenticación, front, editar clínicas o pacientes, paginación ni un proveedor real.

## Cómo tiene que arrancar

`docker compose up --build` levanta todo: tu servicio `api` en el puerto 3000 con `CLOCK_MODE=test`, su base de datos y el `provider`, que ya está en `docker-compose.yml` y no se modifica. Las migraciones corren al arrancar, y `GET /health` responde `200` cuando el servicio está listo.

Los tests de la evaluación llaman a tu API tal como dice el contrato, así que respeta las rutas, los campos, los estados y los códigos de respuesta.

## Qué entregar

Además del código, un README que explique:

1. Cómo levantarlo y cómo pasar tus tests.
2. Tus decisiones: la arquitectura, cómo evitas los envíos duplicados, cómo tratas las zonas horarias y qué descartaste.
3. Qué dejaste fuera y qué harías con más tiempo.
4. Cómo lo llevarías a producción, en una página como mucho: 500 clínicas, unos 20 000 recordatorios al día, un proveedor real de WhatsApp, despliegue y monitorización.
5. Para qué usaste la IA y qué corregiste tú de lo que te propuso.

Deja el proyecto como lo dejarías para un equipo: con tus tests, tipos, lint y CI en GitHub Actions. Si trabajas con agentes de IA, incluye también las instrucciones que les das (`AGENTS.md`, `CLAUDE.md` o similar).

## Cómo se evalúa

| Criterio | Peso | Qué se mira |
|---|---:|---|
| Funciona | 30 % | Tests automáticos contra tu API: horas, envíos, fallos del proveedor, concurrencia y respuestas |
| Arquitectura y código | 30 % | Que las reglas de negocio estén separadas de la infraestructura, los errores bien tratados y que otra persona entienda el código y pueda cambiarlo |
| Entorno de trabajo | 20 % | Que arranque con un comando, tus tests, tipos, lint y CI, y un README con el que otra persona (o un agente) pueda trabajar sin preguntarte |
| Criterio | 20 % | Tus decisiones y su porqué, lo que priorizaste y la nota de producción |

Quienes mejor lo hagan pasan a una entrevista de una hora, el viernes 27 o el lunes 30 de noviembre: explicas tu solución, haces un cambio en directo sobre tu código (con IA, como trabajas normalmente), arreglas un fallo sin IA y se habla de arquitectura.
