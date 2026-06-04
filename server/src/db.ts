import pg from 'pg';
import pgvector from 'pgvector/pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('connect', async (client) => {
  try {
    await pgvector.registerTypes(client);
  } catch {
    // Extension may not exist yet on first boot; runMigrations creates it
  }
});

export { pool };
