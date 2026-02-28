const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  requesterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  requesterRole: {
    type: String,
    enum: ['customer', 'provider'],
    required: true,
  },
  type: {
    type: String,
    enum: ['INCIDENT', 'APPEAL', 'REPORT'],
    required: true,
  },
  subject: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM',
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN_REVIEW', 'RESOLVED'],
    default: 'OPEN',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
  },
});

module.exports = mongoose.model('Complaint', complaintSchema);
