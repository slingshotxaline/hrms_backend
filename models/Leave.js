const mongoose = require('mongoose');

const leaveSchema = mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: ['Sick Leave', 'Annual Leave', 'Casual Leave', 'Unpaid Leave', 'Half Day'], // ✅ Added Half Day
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
    },
    // ✅ NEW: Half day tracking
    isHalfDay: {
      type: Boolean,
      default: false,
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
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedByRole: {
      type: String,
      enum: ['Admin', 'HR', 'Business Lead', 'Team Lead'],
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
    },
    approvers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },
  {
    timestamps: true,
  }
);

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = Leave;