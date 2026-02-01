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
    // Reporting structure
    reportsTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // For Team Leads and Business Leads - who reports to them
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

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// ✅ FIXED: Don't use next() parameter, just return
userSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return; // ✅ Just return, no next()
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', userSchema);

module.exports = User;