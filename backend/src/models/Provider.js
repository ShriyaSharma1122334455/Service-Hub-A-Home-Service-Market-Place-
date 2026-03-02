import mongoose from 'mongoose';

const providerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [200, 'Business name cannot exceed 200 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  serviceCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    index: true,
  }],
  documents: {
    idDocument: {
      type: String,
      default: null
    },
    selfie: {
      type: String,
      default: null
    }
  },
  verification: {
    idVerified: {
      type: Boolean,
      default: false
    },
    faceMatched: {
      type: Boolean,
      default: false
    },
    nsopwChecked: {
      type: Boolean,
      default: false
    },
    selfDeclared: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    rejectionReason: {
      type: String,
      default: null
    }
  },
  ratingAvg: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
    index: true,
  },
  ratingCount: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Virtual for full verification status
providerSchema.virtual('isFullyVerified').get(function() {
  return this.verification.idVerified &&
         this.verification.faceMatched &&
         this.verification.nsopwChecked;
});

providerSchema.set('toJSON', { virtuals: true });
providerSchema.set('toObject', { virtuals: true });

const Provider = mongoose.model('Provider', providerSchema);

export default Provider;