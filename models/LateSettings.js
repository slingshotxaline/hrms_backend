const mongoose = require('mongoose');

const lateSettingsSchema = mongoose.Schema(
  {
    organization: {
      type: String,
      default: 'default',
      unique: true,
    },
    // ✅ Deduction preference: Annual Leave or Salary
    deductionPreference: {
      type: String,
      enum: ['Salary', 'Annual Leave'], // ✅ Changed from 'Leave' to 'Annual Leave'
      default: 'Annual Leave',
    },
    // Grace period settings
    graceDaysPerMonth: {
      type: Number,
      default: 2, // First 2 lates are free
    },
    // Late threshold (minutes)
    lateThresholdMinutes: {
      type: Number,
      default: 1,
    },
    // Enabled/disabled
    isEnabled: {
      type: Boolean,
      default: true,
    },
    // ✅ NEW: Half day settings
    halfDayPunchTime: {
      type: String,
      default: '11:00', // After 11 AM = Half Day
    },
    halfDaysToFullDay: {
      type: Number,
      default: 2, // 2 half days = 1 full day deduction
    },
  },
  {
    timestamps: true,
  }
);

const LateSettings = mongoose.model('LateSettings', lateSettingsSchema);

module.exports = LateSettings;