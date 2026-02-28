import mongoose from 'mongoose';

const complaintSchema = new mongoose.Schema(
  {
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
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    description: {
      type: String,
      required: true,
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
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
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

// Indexes for efficient queries
complaintSchema.index({ requesterId: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ createdAt: -1 });

const Complaint = mongoose.model('Complaint', complaintSchema);

export default Complaint;
