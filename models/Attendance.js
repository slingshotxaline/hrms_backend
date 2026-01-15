const mongoose = require('mongoose');

const attendanceSchema = mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    inTime: {
      type: Date,
    },
    outTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Leave', 'Holiday', 'Weekend'],
      default: 'Absent',
    },
    lateMinutes: {
      type: Number,
      default: 0,
    },
    overtimeMinutes: {
      type: Number,
      default: 0,
    },
    isEdited: {
      type: Boolean,
      default: false,
    },
    auditLog: [
      {
        modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        modifiedAt: { type: Date, default: Date.now },
        previousValue: { type: Object }, // Store snapshot of before change
        reason: { type: String },
      },
    ],
    isLocked: {
      type: Boolean,
      default: false, // Locked after payroll generation
    }
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure one attendance record per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
