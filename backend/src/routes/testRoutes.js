import express from 'express';

const router = express.Router();

// ── Dev/test helper routes ───────────────────────────────────────────────
// GET /api/test/ping — confirms the test router is alive
router.get('/ping', (req, res) => {
  res.json({
    success: true,
    message: 'Test route alive',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

export default router;