# Prueba técnica de backend · ClinicSay

El enunciado está en [`enunciado.pdf`](enunciado.pdf). Aquí tienes el contrato de la API (`openapi.yaml`), el
proveedor de mensajes simulado (`provider/`) y el `docker-compose.yml` de partida.

Se entrega con el [formulario de entrega](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform) hasta el miércoles 25 de noviembre de 2026 a las 17:30 de
Madrid (11:30 en Lima).

## Desarrollo local

Necesitas Docker Desktop con Docker Compose. Para construir y levantar la API, PostgreSQL y el proveedor simulado:

```sh
docker compose up --build
```

La API queda en `http://localhost:3000`, el proveedor simulado en `http://localhost:4010` y PostgreSQL en `localhost:5433`. La primera vez, PostgreSQL crea la base `clinicsay`; la API aplica las migraciones antes de empezar a escuchar. Comprueba que la API está lista con `GET http://localhost:3000/health`.

La conexión interna de la API usa `DATABASE_URL=postgresql://clinicsay:clinicsay@db:5432/clinicsay`. El usuario y la contraseña incluidos en Compose son solo para desarrollo local. Las variables de la API son:

| Variable | Valor local | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto HTTP de la API |
| `CLOCK_MODE` | `test` | Habilita el reloj controlable para la evaluación |
| `PROVIDER_URL` | `http://provider:4010` | Dirección del proveedor simulado dentro de Compose |
| `DATABASE_URL` | `postgresql://clinicsay:clinicsay@db:5432/clinicsay` | Conexión de la API a PostgreSQL |

Para parar los servicios, ejecuta `docker compose down`. El volumen de PostgreSQL se conserva para la siguiente ejecución. El arranque inicial incluye la API base y el endpoint de salud; los demás endpoints del contrato están pendientes de implementación.

## Pruebas y cobertura

El runner de pruebas y los informes de cobertura están pendientes de configuración. Cuando se completen las tareas de [implementación de recordatorios](.ai/specs/tasks.md), los comandos previstos serán:

```sh
npm test
npm run test:coverage
```

`npm test` ejecutará las pruebas unitarias. `npm run test:coverage` ejecutará la misma suite y mostrará un resumen de cobertura en la terminal. También generará:

- `coverage/index.html`: informe navegable que se puede abrir en un navegador para revisar la cobertura por archivo, línea, rama y función.
- `coverage/lcov.info`: informe LCOV para herramientas de CI y análisis de cobertura.

Estos comandos estarán disponibles cuando se configure el runner; todavía no se pueden ejecutar en este scaffold.
