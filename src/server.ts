import { createServer } from 'node:http';
import { Pool } from 'pg';
import { runMigrations } from './storage/migrate.js';

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({ connectionString: databaseUrl });

const server = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    try {
      const readiness = await pool.query(`
        SELECT EXISTS (SELECT 1 FROM schema_migrations)
          AND to_regclass('public.clinics') IS NOT NULL AS ready
      `);
      if (!readiness.rows[0]?.ready) {
        response.writeHead(503, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'database migrations are not ready' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
    } catch {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'database is not ready' }));
    }
    return;
  }

  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not found' }));
});

async function start(): Promise<void> {
  await runMigrations(pool);
  server.listen(port, '0.0.0.0', () => {
    console.log(`ClinicSay API listening on :${port}`);
  });
}

async function shutdown(): Promise<void> {
  server.close();
  await pool.end();
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());

start().catch(async (error: unknown) => {
  console.error('Failed to start ClinicSay API:', error);
  await pool.end();
  process.exitCode = 1;
});
