import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    enum: ['Plumbing', 'Electrical', 'Cleaning', 'Pest Control']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    required: [true, 'Category description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  icon: {
    type: String,
    default: 'default-icon.svg'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create slug before saving
categorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = this.name.toLowerCase().replace(/\s+/g, '-');
  }
  next();
});

const Category = mongoose.model('Category', categorySchema);

export default Category;