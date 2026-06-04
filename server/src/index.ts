import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import { runMigrations } from './migrate.js';
import authRouter from './routes/auth.js';
import condocorpsRouter from './routes/condocorps.js';
import membersRouter from './routes/members.js';
import documentsRouter from './routes/documents.js';
import faqsRouter from './routes/faqs.js';
import chatRouter from './routes/chat.js';
import invitationsRouter from './routes/invitations.js';
import questionPresetsRouter from './routes/question-presets.js';
import platformLlmPromptRouter from './routes/platform-llm-prompt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT ?? '3001', 10);

const corsOrigin = process.env.FRONTEND_URL;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigin && origin === corsOrigin) {
      callback(null, true);
      return;
    }
    // Local dev: Vite may use 5173, 5174, 4000, etc.
    if (process.env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/condocorps', condocorpsRouter);
app.use('/api/members', membersRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/faqs', faqsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/question-presets', questionPresetsRouter);
app.use('/api/platform/llm-prompt', platformLlmPromptRouter);

// Serve static frontend in production
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

async function bootstrapDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — API routes needing the database will fail');
    return;
  }
  await runMigrations();
  const client = await pool.connect();
  try {
    const pgvector = await import('pgvector/pg');
    await pgvector.default.registerTypes(client);
  } finally {
    client.release();
  }
  console.log('Database ready');
}

// Listen immediately so Railway healthchecks pass; migrations run after bind.
app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
  bootstrapDatabase().catch((err) => {
    console.error('Database bootstrap failed:', err);
  });
});
