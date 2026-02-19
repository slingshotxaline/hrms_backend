const mongoose = require('mongoose');

const employeeSchema = mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
    },
    biometricId: {
      type: String,
      unique: true,
      sparse: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
    },
    dateOfBirth: {
      type: Date,
    },
    dateOfJoining: {
      type: Date,
      required: true,
    },
    department: {
      type: String,
      required: true,
    },
    designation: {
      type: String,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
    },
    grossSalary: {
      type: Number,
      default: 0,
    },
    allowances: {
      houseRent: {
        type: Number,
        default: 0,
      },
      medical: {
        type: Number,
        default: 0,
      },
      transport: {
        type: Number,
        default: 0,
      },
    },
    shiftStart: {
      type: String,
      default: '09:00',
    },
    shiftEnd: {
      type: String,
      default: '18:00',
    },
    address: {
      type: String,
    },
    emergencyContact: {
      name: {
        type: String,
      },
      relationship: {
        type: String,
      },
      phone: {
        type: String,
      },
    },
    // ✅ UPDATED: New leave balance structure
    leaveBalance: {
      sick: {
        type: Number,
        default: 10, // ✅ Changed from 12 to 10
      },
      annual: {
        type: Number,
        default: 10, // ✅ Changed from 'earned' to 'annual'
      },
      casual: {
        type: Number,
        default: 10, // ✅ Changed from 12 to 10
      },
      unpaid: {
        type: Number,
        default: 0,
      },
    },
    // ✅ NEW: Track monthly leave usage for restrictions
    monthlyLeaveUsage: {
      type: Map,
      of: {
        annual: { type: Number, default: 0 },
        casual: { type: Number, default: 0 },
      },
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Pre-save hook with proper async/await handling
employeeSchema.pre('save', async function() {
  try {
    // Calculate gross salary
    if (this.isModified('basicSalary') || this.isModified('allowances')) {
      const totalAllowances = 
        (this.allowances?.houseRent || 0) + 
        (this.allowances?.medical || 0) + 
        (this.allowances?.transport || 0);
      
      this.grossSalary = (this.basicSalary || 0) + totalAllowances;
    }

    // ✅ Sync isActive status with User model
    if (this.isModified('isActive') && this.user) {
      const User = mongoose.model('User');
      await User.findByIdAndUpdate(
        this.user,
        { isActive: this.isActive },
        { new: true }
      );
      console.log(`✅ Synced Employee.isActive (${this.isActive}) → User.isActive for ${this.firstName} ${this.lastName}`);
    }
  } catch (error) {
    console.error('❌ Error in Employee pre-save hook:', error);
    throw error;
  }
});

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;