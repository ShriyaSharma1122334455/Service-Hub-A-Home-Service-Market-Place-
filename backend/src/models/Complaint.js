import mongoose from 'mongoose';

const SUBJECT_OPTIONS = [
  'Provider did not show up',
  'Poor quality of work',
  'Billing or payment issue',
  'Rude or unprofessional behavior',
  'Verification or profile appeal',
  'Incorrect service category',
  'Safety concern',
  'Other',
];

const complaintSchema = new mongoose.Schema(
  {
    complaintId: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      enum: SUBJECT_OPTIONS,
      required: true,
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

// Auto-generate a human-readable complaint reference ID (e.g. COMP-A1B2)
complaintSchema.pre('save', function (next) {
  if (!this.complaintId) {
    const chars = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.complaintId = `COMP-${chars}`;
  }
  next();
});

// Indexes for efficient queries
complaintSchema.index({ userId: 1 });
complaintSchema.index({ status: 1 });
complaintSchema.index({ createdAt: -1 });

const Complaint = mongoose.model('Complaint', complaintSchema);

export { SUBJECT_OPTIONS };
export default Complaint;
