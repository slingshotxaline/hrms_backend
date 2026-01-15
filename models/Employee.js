const mongoose = require('mongoose');

const employeeSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    employeeCode: {
      type: String,
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
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
    joiningDate: {
      type: Date,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    allowances: {
      houseRent: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
    },
    shiftStart: {
      type: String, // Format "HH:mm"
      required: true,
      default: "09:00"
    },
    shiftEnd: {
      type: String, // Format "HH:mm"
      required: true,
      default: "18:00"
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
