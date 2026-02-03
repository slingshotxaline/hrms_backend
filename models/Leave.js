// const mongoose = require('mongoose');

// const leaveSchema = mongoose.Schema(
//   {
//     employee: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'Employee',
//       required: true,
//     },
//     leaveType: {
//       type: String,
//       enum: ['CL', 'SL', 'EL', 'Unpaid'], // Casual, Sick, Earned, Unpaid
//       required: true,
//     },
//     startDate: {
//       type: Date,
//       required: true,
//     },
//     endDate: {
//       type: Date,
//       required: true,
//     },
//     reason: {
//       type: String,
//       required: true,
//     },
//     status: {
//       type: String,
//       enum: ['Pending', 'Approved', 'Rejected'],
//       default: 'Pending',
//     },
//     approvedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User',
//     },
//     approvalDate: {
//       type: Date,
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const Leave = mongoose.model('Leave', leaveSchema);

// module.exports = Leave;


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
      // enum: ['CL', 'SL', 'EL', 'Unpaid'], // Casual, Sick, Earned, Unpaid
      enum: ['Casual Leave', 'Sick Leave', 'Earned Leave', 'Unpaid Leave'],
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
    reason: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    // ✅ New: Track who approved/rejected
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
    // ✅ New: Track who can approve this leave
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