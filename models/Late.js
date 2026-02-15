const mongoose = require('mongoose');

const lateSchema = mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attendance: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Attendance',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    lateMinutes: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    approvers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedByRole: {
      type: String,
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
    // Deduction tracking
    isDeducted: {
      type: Boolean,
      default: false,
    },
    deductionType: {
      type: String,
      enum: ['None', 'Salary', 'Leave'],
      default: 'None',
    },
    deductionAmount: {
      type: Number,
      default: 0,
    },
    monthlyLateCount: {
      type: Number, // Late count for this month when this late occurred
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
lateSchema.index({ employee: 1, date: 1 });
lateSchema.index({ user: 1, status: 1 });
lateSchema.index({ status: 1 });

const Late = mongoose.model('Late', lateSchema);

module.exports = Late;