import express from 'express';

const router = express.Router();

// Minimal protected route used by tests. Returns 401 if no Authorization header.
router.get('/profile', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return res.json({ success: true, data: { message: 'Protected profile' } });
});

export default router;