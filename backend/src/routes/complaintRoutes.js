import express from 'express';
import Complaint from '../models/Complaint.js';

const router = express.Router();

// POST /api/complaints — submit a new complaint
router.post('/', async (req, res) => {
  try {
    const { requesterId, requesterRole, type, subject, description, priority } =
      req.body;

    const complaint = new Complaint({
      requesterId,
      requesterRole,
      type,
      subject,
      description,
      priority,
    });

    await complaint.save();

    res.status(201).json({
      message: 'Complaint submitted successfully',
      id: complaint._id,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/complaints — admin: view all complaints (newest first)
router.get('/', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/complaints/:id/status — admin: update complaint status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const update = { status };
    if (status === 'RESOLVED') {
      update.resolvedAt = new Date();
    }
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );
    if (!complaint) {
      return res.status(404).json({ error: 'Complaint not found' });
    }
    res.json(complaint);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
