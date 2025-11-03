import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { spawnPredict } from '../services/pythonRunner.js';

const upload = multer({ dest: 'storage/tmp' });
const logSubscribers = new Map();

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeForStatic(p) {
  const absolute = path.resolve(p);
  const storageRoot = path.resolve('storage');
  return absolute.startsWith(storageRoot)
    ? absolute.slice(storageRoot.length + 1).replace(/\\/g, '/')
    : p;
}

function attachSubscriber(predId, res) {
  if (!logSubscribers.has(predId)) {
    logSubscribers.set(predId, new Set());
  }
  logSubscribers.get(predId).add(res);
  res.on('close', () => {
    const set = logSubscribers.get(predId);
    if (set) {
      set.delete(res);
      if (!set.size) logSubscribers.delete(predId);
    }
  });
}

function broadcastLog(predId, message) {
  const subs = logSubscribers.get(predId);
  if (!subs) return;
  for (const res of subs) {
    res.write(`data: ${message.replace(/\r?\n/g, '\n')}\n\n`);
  }
}

export default function predictRoutes(prisma) {
  const router = express.Router();

  router.post('/', requireAuth, upload.single('file'), async (req, res) => {
    const orgId = req.user.orgId;
    const latest = await prisma.modelRun.findFirst({
      where: { orgId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' }
    });

    if (!latest) {
      return res.status(400).json({ error: 'No trained model available for this organization' });
    }

    if (!req.file && !req.body.jsonText) {
      return res.status(400).json({ error: 'Prediction JSON input is required' });
    }

    let studentJson;
    if (req.file) {
      studentJson = fs.readFileSync(req.file.path, 'utf8');
    } else {
      studentJson = req.body.jsonText;
    }

    let parsed;
    try {
      parsed = JSON.parse(studentJson);
    } catch (err) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Student JSON must be valid JSON' });
    }

    if (!parsed || typeof parsed !== 'object') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Student JSON must be an object' });
    }

    const predictionId = randomUUID();
    const baseDir = path.join('storage', 'predictions', orgId);
    ensureDir(baseDir);

    const inputPath = path.join(baseDir, `${predictionId}.json`);
    fs.writeFileSync(inputPath, JSON.stringify(parsed, null, 2), 'utf8');

    const outFile = path.join(baseDir, `${predictionId}.result.json`);
    const logPath = path.join(baseDir, `${predictionId}.log`);

    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    const studentId = String(parsed.student_id ?? parsed.studentId ?? 'unknown');

    await prisma.prediction.create({
      data: {
        id: predictionId,
        orgId,
        studentId,
        inputPath,
        outFile,
        results: JSON.stringify({ status: 'PENDING' })
      }
    });

    res.json({ predictionId });

    fs.appendFileSync(logPath, `Starting prediction ${predictionId}\n`);
    broadcastLog(predictionId, `Starting prediction ${predictionId}\n`);

    let payload = null;
    spawnPredict({
      orgId,
      studentJson: inputPath,
      artifactsDir: latest.artifactsDir,
      outFile,
      onData: (chunk) => {
        const text = chunk.toString();
        fs.appendFileSync(logPath, text);
        broadcastLog(predictionId, text);
        const trimmed = text.trim();
        if (trimmed.startsWith('__RESULT__')) {
          try {
            payload = JSON.parse(trimmed.replace('__RESULT__', ''));
          } catch (err) {
            console.error('Failed to parse prediction payload', err);
          }
        }
      },
      onEnd: async (code) => {
        if (!payload || payload.status !== 'ok' || code !== 0) {
          await prisma.prediction.update({
            where: { id: predictionId },
            data: { results: JSON.stringify({ status: 'FAILED' }) }
          });
          return;
        }

        try {
          fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');
        } catch (err) {
          console.error('Failed to persist prediction output', err);
        }

        const summary = {
          risk: payload.risk,
          current: payload.current,
          predictions: payload.predictions
        };

        await prisma.prediction.update({
          where: { id: predictionId },
          data: { results: JSON.stringify(payload), summary: JSON.stringify(summary) }
        });
      }
    });
  });

  router.get('/:id/logs', requireAuth, async (req, res) => {
    const prediction = await prisma.prediction.findUnique({ where: { id: req.params.id } });
    if (!prediction || prediction.orgId !== req.user.orgId) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    const logPath = path.join('storage', 'predictions', req.user.orgId, `${prediction.id}.log`);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.write('event: open\ndata: connected\n\n');

    if (fs.existsSync(logPath)) {
      const existing = fs.readFileSync(logPath, 'utf8');
      if (existing) {
        res.write(`data: ${existing.replace(/\r?\n/g, '\n')}\n\n`);
      }
    }

    attachSubscriber(prediction.id, res);
  });

  router.get('/', requireAuth, async (req, res) => {
    const page = Number(req.query.page || 1);
    const pageSize = Math.min(Number(req.query.pageSize || 20), 100);
    const skip = (page - 1) * pageSize;

    const [items, total] = await prisma.$transaction([
      prisma.prediction.findMany({
        where: { orgId: req.user.orgId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          studentId: true,
          createdAt: true,
          summary: true
        }
      }),
      prisma.prediction.count({ where: { orgId: req.user.orgId } })
    ]);

    const normalizedItems = items.map((item) => ({
      ...item,
      summary: item.summary ? JSON.parse(item.summary) : null
    }));

    res.json({ page, pageSize, total, items: normalizedItems });
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const prediction = await prisma.prediction.findUnique({ where: { id: req.params.id } });
    if (!prediction || prediction.orgId !== req.user.orgId) {
      return res.status(404).json({ error: 'Prediction not found' });
    }

    res.json({
      ...prediction,
      results: prediction.results ? JSON.parse(prediction.results) : null,
      summary: prediction.summary ? JSON.parse(prediction.summary) : null,
      inputUrl: `/static/${normalizeForStatic(prediction.inputPath)}`,
      resultUrl: `/static/${normalizeForStatic(prediction.outFile)}`
    });
  });

  return router;
}
