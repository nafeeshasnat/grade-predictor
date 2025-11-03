import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { validateAndClampConfig } from '../utils/validateConfig.js';
import { spawnTrain } from '../services/pythonRunner.js';

const upload = multer({ dest: 'storage/tmp' });

export default function modelRoutes(prisma) {
  const router = express.Router();

  router.get('/status', requireAuth, async (req, res) => {
    const last = await prisma.modelRun.findFirst({
      where: { orgId: req.user.orgId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ hasModel: !!last, lastRun: last });
  });

  router.post('/train', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      const orgId = req.user.orgId;
      const raw = req.body.configJson ? JSON.parse(req.body.configJson) : {};
      const config = validateAndClampConfig(raw);
      const uploadDir = path.join('storage', 'uploads', orgId);
      const runDir = path.join('storage', 'models', orgId, Date.now().toString());
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.mkdirSync(runDir, { recursive: true });

      const trainJsonPath = path.join(uploadDir, `train_${Date.now()}.json`);
      fs.renameSync(req.file.path, trainJsonPath);

      const configPath = path.join(runDir, 'config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const modelRun = await prisma.modelRun.create({
        data: { orgId, status: 'PENDING', config, artifactsDir: runDir }
      });

      res.json({ runId: modelRun.id });

      const logPath = path.join(runDir, 'train.log');
      const stream = fs.createWriteStream(logPath, { flags: 'a' });

      await prisma.modelRun.update({ where: { id: modelRun.id }, data: { status: 'RUNNING' } });

      let finalResult = null;
      spawnTrain({
        orgId, trainJson: trainJsonPath, configJson: configPath, outDir: runDir,
        onData: (t) => {
          stream.write(t);
          const m = t.toString().trim();
          if (m.startsWith('__RESULT__')) {
            try { finalResult = JSON.parse(m.replace('__RESULT__', '')); } catch {}
          }
        },
        onEnd: async (code) => {
          stream.end();
          if (finalResult?.status === 'ok' && code === 0) {
            await prisma.modelRun.update({
              where: { id: modelRun.id },
              data: { status: 'SUCCEEDED', metrics: finalResult.metrics, plots: finalResult.plots, finishedAt: new Date() }
            });
          } else {
            await prisma.modelRun.update({
              where: { id: modelRun.id },
              data: { status: 'FAILED', finishedAt: new Date() }
            });
          }
        }
      });
    } catch (e) { next(e); }
  });

  router.get('/train/:runId/logs', requireAuth, async (req, res) => {
    const run = await prisma.modelRun.findUnique({ where: { id: req.params.runId } });
    if (!run || run.orgId !== req.user.orgId) return res.sendStatus(404);
    const logPath = path.join(run.artifactsDir, 'train.log');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive'
    });
    res.write(`event: open\ndata: ok\n\n`);
    let lastSize = 0;
    const interval = setInterval(() => {
      if (!fs.existsSync(logPath)) return;
      const stat = fs.statSync(logPath);
      if (stat.size > lastSize) {
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buf, 0, buf.length, lastSize);
        fs.closeSync(fd);
        lastSize = stat.size;
        res.write(`data: ${buf.toString()}\n\n`);
      }
    }, 1000);
    req.on('close', () => clearInterval(interval));
  });

  router.get('/summary', requireAuth, async (req, res) => {
    const last = await prisma.modelRun.findFirst({
      where: { orgId: req.user.orgId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' }
    });
    if (!last) return res.json({ hasModel: false });
    res.json({ hasModel: true, metrics: last.metrics, plots: last.plots, artifactsDir: last.artifactsDir });
  });

  return router;
}
