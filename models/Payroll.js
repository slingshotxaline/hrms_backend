const mongoose = require('mongoose');

const payrollSchema = mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    month: {
      type: Date,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
    },
    allowances: {
      houseRent: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
    },
    totalAllowances: {
      type: Number,
      default: 0,
    },
    grossSalary: {
      type: Number,
      required: true,
    },
    deductions: {
      absent: { type: Number, default: 0 },
      halfDay: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    totalDeductions: {
      type: Number,
      default: 0,
    },
    overtime: {
      hours: { type: Number, default: 0 },
      amount: { type: Number, default: 0 }, // ✅ For information only, NOT added to net salary
    },
    // ✅ NEW: Manual adjustments
    adjustments: [{
      amount: {
        type: Number,
        required: true, // Positive = addition, Negative = deduction
      },
      description: {
        type: String,
        required: true,
      },
      addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      addedAt: {
        type: Date,
        default: Date.now,
      },
    }],
    totalAdjustments: {
      type: Number,
      default: 0,
    },
    netSalary: {
      type: Number,
      required: true,
    },
    attendance: {
      present: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      leave: { type: Number, default: 0 },
      halfDay: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      lateApproved: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Paid'],
      default: 'Pending',
    },
    paidAt: {
      type: Date,
    },
    version: {
      type: Number,
      default: 1,
    },
    isRegenerated: {
      type: Boolean,
      default: false,
    },
    regenerationHistory: [{
      regeneratedAt: {
        type: Date,
        default: Date.now,
      },
      regeneratedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      reason: {
        type: String,
      },
      previousNetSalary: {
        type: Number,
      },
      newNetSalary: {
        type: Number,
      },
      changes: {
        type: Object,
      }
    }],
    notes: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

payrollSchema.index({ employee: 1, month: 1 }, { unique: true });

const Payroll = mongoose.model('Payroll', payrollSchema);

module.exports = Payroll;