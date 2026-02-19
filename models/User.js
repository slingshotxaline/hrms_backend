const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
      select: true, // Make sure password is available when needed
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

// ✅ Method to compare password (MUST BE ADDED BEFORE pre-save hooks)
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    console.log(`🔒 Password hashed for user: ${this.name}`);
    next();
  } catch (error) {
    console.error('❌ Error hashing password:', error);
    next(error);
  }
});

// ✅ Pre-save hook to sync isActive with Employee model
userSchema.pre('save', async function(next) {
  try {
    // Only sync if isActive changed AND employee exists
    if (this.isModified('isActive') && this.employeeId) {
      const Employee = mongoose.model('Employee');
      await Employee.findByIdAndUpdate(
        this.employeeId,
        { isActive: this.isActive },
        { new: true }
      );
      console.log(`✅ Synced User.isActive (${this.isActive}) → Employee.isActive for ${this.name}`);
    }
    next();
  } catch (error) {
    console.error('❌ Error in User pre-save hook:', error);
    next(error);
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;