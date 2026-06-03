import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate.js';
import authRouter from './routes/auth.js';
import condocorpsRouter from './routes/condocorps.js';
import membersRouter from './routes/members.js';
import documentsRouter from './routes/documents.js';
import faqsRouter from './routes/faqs.js';
import chatRouter from './routes/chat.js';
import invitationsRouter from './routes/invitations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT ?? '3001', 10);

app.use(cors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
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

// Serve static frontend in production
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

async function start() {
  await runMigrations();
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
  });
}

start().catch(console.error);
