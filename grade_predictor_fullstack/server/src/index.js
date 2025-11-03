import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import modelRoutes from './routes/models.js';
import predictRoutes from './routes/predict.js';

const prisma = new PrismaClient();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// static serve storage
app.use('/static', express.static(path.resolve(__dirname, '../../storage')));

app.get('/api/health', (_, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes(prisma));
app.use('/api/models', modelRoutes(prisma));
app.use('/api/predict', predictRoutes(prisma));

// error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err?.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[server] listening on ${PORT}`));
