import express from 'express';
import bcrypt from 'bcryptjs';
import { signToken, requireAuth } from '../auth.js';

export default function authRoutes(prisma) {
  const router = express.Router();

  router.post('/signup', async (req, res) => {
    const { orgName, email, password } = req.body;
    if (!orgName || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const org = await prisma.organization.create({ data: { name: orgName } });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { orgId: org.id, email, passwordHash } });
    const token = signToken({ uid: user.id, orgId: org.id });
    res.json({ token, user: { id: user.id, email }, org });
  });

  router.post('/signin', async (req, res) => {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const token = signToken({ uid: user.id, orgId: user.orgId });
    const org = await prisma.organization.findUnique({ where: { id: user.orgId } });
    res.json({ token, user: { id: user.id, email }, org });
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.uid } });
    const org = await prisma.organization.findUnique({ where: { id: req.user.orgId } });
    res.json({ user: { id: user.id, email: user.email }, org });
  });

  return router;
}
