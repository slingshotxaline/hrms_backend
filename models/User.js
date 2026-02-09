const mongoose = require('mongoose');

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['Admin', 'HR', 'Business Lead', 'Team Lead', 'Employee'],
      default: 'Employee',
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    reportsTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    manages: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ FIXED: Pre-save hook with proper async/await handling
userSchema.pre('save', async function() {
  try {
    // ✅ Sync isActive with Employee model (only if employee exists and isActive changed)
    if (this.isModified('isActive') && this.employeeId) {
      const Employee = mongoose.model('Employee');
      await Employee.findByIdAndUpdate(
        this.employeeId,
        { isActive: this.isActive },
        { new: true }
      );
      console.log(`✅ Synced User.isActive (${this.isActive}) → Employee.isActive for ${this.name}`);
    }
  } catch (error) {
    console.error('❌ Error in User pre-save hook:', error);
    throw error; // Re-throw to prevent save if sync fails
  }
  
  // ✅ No need to call next() - mongoose handles it automatically for async functions
});

const User = mongoose.model('User', userSchema);

module.exports = User;