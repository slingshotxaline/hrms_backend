const mongoose = require('mongoose');

const lateSettingsSchema = mongoose.Schema(
  {
    // There should only be one settings document
    organization: {
      type: String,
      default: 'default',
      unique: true,
    },
    // Deduction preference
    deductionPreference: {
      type: String,
      enum: ['Salary', 'Leave', 'Manual'],
      default: 'Leave',
      // Salary: Always deduct salary
      // Leave: Deduct leave first, then salary if no leave
      // Manual: Admin decides per case
    },
    // Grace period settings
    graceDaysPerMonth: {
      type: Number,
      default: 2, // First 2 lates are free
    },
    // Late threshold (minutes)
    lateThresholdMinutes: {
      type: Number,
      default: 1, // 1+ minutes late counts as late
    },
    // Auto-approve for minor lates
    autoApproveUnder: {
      type: Number,
      default: 0, // 0 means no auto-approve
    },
    // Enabled/disabled
    isEnabled: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const LateSettings = mongoose.model('LateSettings', lateSettingsSchema);

module.exports = LateSettings;