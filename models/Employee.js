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
      sparse: true, // Allows null values while maintaining uniqueness
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
    salary: {
      type: Number,
      required: true,
    },
    bankAccount: {
      accountNumber: String,
      bankName: String,
      ifscCode: String,
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: String,
    },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
    },
    // ✅ Leave Balance with default values
    leaveBalance: {
      casual: {
        type: Number,
        default: 12, // ✅ Default 12 casual leaves
      },
      sick: {
        type: Number,
        default: 12, // ✅ Default 12 sick leaves
      },
      earned: {
        type: Number,
        default: 15, // ✅ Default 15 earned leaves
      },
      unpaid: {
        type: Number,
        default: 0,
      },
    },
    allowances: {
      hra: {
        type: Number,
        default: 0,
      },
      transport: {
        type: Number,
        default: 0,
      },
      medical: {
        type: Number,
        default: 0,
      },
      other: {
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Employee = mongoose.model('Employee', employeeSchema);

module.exports = Employee;