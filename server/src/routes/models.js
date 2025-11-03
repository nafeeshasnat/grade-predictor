import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { validateAndClampConfig } from '../utils/validateConfig.js';
import { spawnTrain } from '../services/pythonRunner.js';

const upload = multer({ dest: 'storage/tmp' });

const logSubscribers = new Map();

function safeParseJson(value, fallback = null) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    console.warn('Failed to parse JSON from database column', err);
    return fallback;
  }
}

function hydrateRun(run) {
  if (!run) return run;
  return {
    ...run,
    config: safeParseJson(run.config),
    metrics: safeParseJson(run.metrics),
    plots: safeParseJson(run.plots, []),
    gradePoints: safeParseJson(run.gradePoints)
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeLog(logPath, message) {
  fs.appendFileSync(logPath, message);
}

function broadcastLog(runId, message) {
  const subs = logSubscribers.get(runId);
  if (!subs) return;
  for (const res of subs) {
    res.write(`data: ${message.replace(/\r?\n/g, '\n')}\n\n`);
  }
}

function attachSubscriber(runId, res) {
  if (!logSubscribers.has(runId)) {
    logSubscribers.set(runId, new Set());
  }
  logSubscribers.get(runId).add(res);
  res.on('close', () => {
    const set = logSubscribers.get(runId);
    if (set) {
      set.delete(res);
      if (!set.size) logSubscribers.delete(runId);
    }
  });
}

function normalizeForStatic(p) {
  const absolute = path.resolve(p);
  const storageRoot = path.resolve('storage');
  return absolute.startsWith(storageRoot)
    ? absolute.slice(storageRoot.length + 1).replace(/\\/g, '/')
    : p;
}

export default function modelRoutes(prisma) {
  const router = express.Router();

  router.get('/status', requireAuth, async (req, res) => {
    const lastRunRecord = await prisma.modelRun.findFirst({
      where: { orgId: req.user.orgId },
      orderBy: { createdAt: 'desc' }
    });

    const lastRun = hydrateRun(lastRunRecord);

    res.json({ hasModel: Boolean(lastRun && lastRun.status === 'SUCCEEDED'), lastRun });
  });

  const handleTrain = async (req, res, { isRetrain = false } = {}) => {
    const orgId = req.user.orgId;
    const cleanup = () => {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    };

    if (!req.file && !req.body.jsonText) {
      cleanup();
      return res.status(400).json({ error: 'Training dataset JSON is required' });
    }

    let configRaw = {};
    try {
      const source = req.body.configJson ? req.body.configJson : '{}';
      configRaw = JSON.parse(source);
    } catch (err) {
      cleanup();
      return res.status(400).json({ error: 'configJson must be valid JSON' });
    }

    let config;
    try {
      config = validateAndClampConfig(configRaw);
    } catch (err) {
      cleanup();
      return res.status(400).json({ error: err.message });
    }

    const trainUploadDir = path.join('storage', 'uploads', orgId);
    ensureDir(trainUploadDir);

    const runId = randomUUID();
    const runDir = path.join('storage', 'models', orgId, runId);
    ensureDir(runDir);

    const logPath = path.join(runDir, 'train.log');
    const datasetPath = path.join(trainUploadDir, `${Date.now()}_${runId}.json`);

    try {
      if (req.file) {
        fs.renameSync(req.file.path, datasetPath);
      } else if (req.body.jsonText) {
        fs.writeFileSync(datasetPath, req.body.jsonText, 'utf8');
      }
    } catch (err) {
      cleanup();
      return res.status(500).json({ error: 'Failed to persist training dataset' });
    }

    const configPath = path.join(runDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const modelRun = await prisma.modelRun.create({
      data: {
        id: runId,
        orgId,
        status: 'PENDING',
        config: JSON.stringify(config),
        artifactsDir: runDir,
        plots: JSON.stringify([]),
        createdAt: new Date()
      }
    });

    res.json({ runId: modelRun.id, message: isRetrain ? 'Retraining started' : 'Training started' });

    writeLog(logPath, `Starting training job ${runId}\n`);

    await prisma.modelRun.update({
      where: { id: runId },
      data: { status: 'RUNNING' }
    });

    let resultPayload = null;

    const broadcast = (chunk) => {
      const text = chunk.toString();
      writeLog(logPath, text);
      broadcastLog(runId, text);
      const trimmed = text.trim();
      if (trimmed.startsWith('__RESULT__')) {
        try {
          resultPayload = JSON.parse(trimmed.replace('__RESULT__', ''));
        } catch (err) {
          console.error('Failed to parse training result payload', err);
        }
      }
    };

    spawnTrain({
      orgId,
      trainJson: datasetPath,
      configJson: configPath,
      outDir: runDir,
      onData: broadcast,
      onEnd: async (code) => {
        const finishedAt = new Date();
        if (resultPayload && resultPayload.status === 'ok' && code === 0) {
          const plots = Array.isArray(resultPayload.plots) ? resultPayload.plots : [];
          await prisma.modelRun.update({
            where: { id: runId },
            data: {
              status: 'SUCCEEDED',
              metrics: JSON.stringify(resultPayload.metrics || {}),
              plots: JSON.stringify(plots),
              gradePoints: JSON.stringify(resultPayload.gradePoints || config.GRADE_POINTS),
              bestModel: resultPayload.bestModel || null,
              finishedAt
            }
          });
          await prisma.modelRun.updateMany({
            where: {
              orgId,
              status: 'SUCCEEDED',
              id: { not: runId },
              supersededAt: null
            },
            data: { supersededAt: finishedAt }
          });
        } else {
          await prisma.modelRun.update({
            where: { id: runId },
            data: { status: 'FAILED', finishedAt }
          });
        }
      }
    });
  };

  router.post('/train', requireAuth, upload.single('trainJson'), (req, res) => {
    handleTrain(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to start training job' });
    });
  });

  router.post('/retrain', requireAuth, upload.single('trainJson'), (req, res) => {
    handleTrain(req, res, { isRetrain: true }).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'Failed to start retraining job' });
    });
  });

  router.get('/train/:runId/logs', requireAuth, async (req, res) => {
    const run = await prisma.modelRun.findUnique({ where: { id: req.params.runId } });
    if (!run || run.orgId !== req.user.orgId) {
      return res.status(404).json({ error: 'Run not found' });
    }

    const logPath = path.join(run.artifactsDir, 'train.log');

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

    attachSubscriber(run.id, res);
  });

  router.get('/summary', requireAuth, async (req, res) => {
    const runRecord = await prisma.modelRun.findFirst({
      where: { orgId: req.user.orgId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' }
    });

    if (!runRecord) {
      return res.json({ hasModel: false });
    }

    const run = hydrateRun(runRecord);
    const runConfig = run.config || {};
    const runMetrics = run.metrics || {};
    const storedPlots = run.plots || [];
    const storedGradePoints = run.gradePoints || null;

    const artifactsRel = normalizeForStatic(run.artifactsDir);
    const plots = (storedPlots || []).map((plotPath) => {
      const absolutePlot = path.isAbsolute(plotPath)
        ? plotPath
        : path.join(run.artifactsDir, plotPath);
      return `/static/${normalizeForStatic(absolutePlot)}`;
    });

    res.json({
      hasModel: true,
      metrics: runMetrics,
      plots,
      gradePoints: storedGradePoints || runConfig?.GRADE_POINTS,
      bestModel: run.bestModel || null,
      trainedAt: run.finishedAt,
      artifactsDir: `/static/${artifactsRel}`
    });
  });

  router.get('/', requireAuth, async (req, res) => {
    const runs = await prisma.modelRun.findMany({
      where: { orgId: req.user.orgId },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json({ items: runs.map(hydrateRun) });
  });

  return router;
}
