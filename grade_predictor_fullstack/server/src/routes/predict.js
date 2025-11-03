import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { requireAuth } from '../auth.js';
import { spawnPredict } from '../services/pythonRunner.js';

const upload = multer({ dest: 'storage/tmp' });

export default function predictRoutes(prisma) {
  const router = express.Router();

  router.post('/', requireAuth, upload.single('file'), async (req, res, next) => {
    try {
      const orgId = req.user.orgId;
      const latest = await prisma.modelRun.findFirst({
        where: { orgId, status: 'SUCCEEDED' },
        orderBy: { createdAt: 'desc' }
      });
      if (!latest) return res.status(400).json({ error: 'No trained model' });

      const predDir = path.join('storage', 'predictions', orgId);
      fs.mkdirSync(predDir, { recursive: true });

      const studentPath = path.join(predDir, `student_${Date.now()}.json`);
      fs.renameSync(req.file.path, studentPath);

      const outFile = path.join(predDir, `pred_${Date.now()}.json`);
      let finalResult = null;

      spawnPredict({
        orgId, studentJson: studentPath, artifactsDir: latest.artifactsDir, outFile,
        onData: (t) => {
          const m = t.toString().trim();
          if (m.startsWith('__RESULT__')) {
            try { finalResult = JSON.parse(m.replace('__RESULT__', '')); } catch {}
          }
        },
        onEnd: async () => {
          if (!finalResult) return res.status(500).json({ error: 'Prediction failed' });
          const student = JSON.parse(fs.readFileSync(studentPath, 'utf8'));
          const rec = await prisma.prediction.create({
            data: {
              orgId, studentId: String(student.student_id || 'unknown'),
              inputPath: studentPath, results: finalResult
            }
          });
          res.json({ prediction: rec });
        }
      });
    } catch (e) { next(e); }
  });

  router.get('/', requireAuth, async (req, res) => {
    const rows = await prisma.prediction.findMany({
      where: { orgId: req.user.orgId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ items: rows });
  });

  router.get('/:id', requireAuth, async (req, res) => {
    const row = await prisma.prediction.findUnique({ where: { id: req.params.id } });
    if (!row || row.orgId !== req.user.orgId) return res.sendStatus(404);
    res.json(row);
  });

  return router;
}
