import mongoose from 'mongoose';

const verificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  documentType: {
    type: String,
    enum: ['passport', 'drivers_license'],
    required: [true, 'Document type is required'],
  },
  idDocumentUrl: {
    type: String,
    default: null,
  },
  selfieUrl: {
    type: String,
    default: null,
  },
  ocrResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  faceMatchResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  nsopwResult: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  extractedName: {
    type: String,
    trim: true,
    default: null,
  },
  extractedDOB: {
    type: String,
    trim: true,
    default: null,
  },
  verificationStatus: {
    type: String,
    enum: ['unverified', 'pending', 'verified', 'failed'],
    default: 'unverified',
  },
  rejectionReason: {
    type: String,
    default: null,
  },
  submittedAt: {
    type: Date,
    default: null,
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes
verificationSchema.index({ userId: 1, verificationStatus: 1 });
verificationSchema.index({ submittedAt: 1 });

const Verification = mongoose.model('Verification', verificationSchema);

export default Verification;
