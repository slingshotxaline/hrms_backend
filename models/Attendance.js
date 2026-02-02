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
    // ✅ First punch IN (office entry)
    inTime: {
      type: Date,
    },
    // ✅ Last punch OUT (office exit)
    outTime: {
      type: Date,
    },
    // ✅ All punches throughout the day
    punches: [
      {
        timestamp: {
          type: Date,
          required: true,
        },
        type: {
          type: String,
          enum: ['IN', 'OUT'],
          required: true,
        },
        location: {
          type: String,
        },
        deviceId: {
          type: String,
        },
      }
    ],
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
    // ✅ Total break time (time between OUT and next IN)
    totalBreakMinutes: {
      type: Number,
      default: 0,
    },
    // ✅ Net working hours (total time - breaks)
    netWorkingMinutes: {
      type: Number,
      default: 0,
    },
    timingStatus: {
      type: String,
      enum: ['Early', 'On Time', 'On Time (Grace)', 'Late', 'Half Day'],
      default: 'On Time',
    },
    isEarly: {
      type: Boolean,
      default: false,
    },
    earlyMinutes: {
      type: Number,
      default: 0,
    },
    usedGracePeriod: {
      type: Boolean,
      default: false,
    },
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    hasOvertime: {
      type: Boolean,
      default: false,
    },
    earlyLeave: {
      type: Boolean,
      default: false,
    },
    earlyLeaveMinutes: {
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
        previousValue: { type: Object },
        reason: { type: String },
      },
    ],
    isLocked: {
      type: Boolean,
      default: false,
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