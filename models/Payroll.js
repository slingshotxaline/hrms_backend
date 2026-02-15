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
      late: { type: Number, default: 0 }, // ✅ ADD THIS
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    totalDeductions: {
      type: Number,
      default: 0,
    },
    overtime: {
      hours: { type: Number, default: 0 },
      amount: { type: Number, default: 0 },
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
      late: { type: Number, default: 0 }, // ✅ ADD THIS
      lateApproved: { type: Number, default: 0 }, // ✅ ADD THIS
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Paid'],
      default: 'Pending',
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

payrollSchema.index({ employee: 1, month: 1 }, { unique: true });

const Payroll = mongoose.model('Payroll', payrollSchema);

module.exports = Payroll;