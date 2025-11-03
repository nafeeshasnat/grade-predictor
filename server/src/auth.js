import jwt from 'jsonwebtoken';
const { JWT_SECRET } = process.env;

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function extractToken(req) {
  if (req.query && req.query.token) return req.query.token;
  const hdr = req.headers.authorization || '';
  if (hdr.startsWith('Bearer ')) return hdr.slice(7);
  return null;
}

export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function getTokenFromRequest(req) {
  return extractToken(req);
}
