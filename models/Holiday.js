const mongoose = require('mongoose');

const holidaySchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ['Government', 'Religious', 'Company'],
      required: true,
    },
    isPaid: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

const Holiday = mongoose.model('Holiday', holidaySchema);

module.exports = Holiday;
