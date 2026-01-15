const Leave = require('../models/Leave');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private/Employee
const applyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;

    // TODO: Get employee ID from logged in user (req.user.employeeId)
    // For now, assuming req.user._id is linked or passed
    // We need to fetch Employee ID linked to User
    // Ideally User model has 'employeeId' field.

    const leave = await Leave.create({
      employee: req.body.employeeId, // Should come from req.user linkage
      leaveType,
      startDate,
      endDate,
      reason,
    });

    res.status(201).json(leave);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get leaves
// @route   GET /api/leaves
// @access  Private
const getLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({}).populate('employee', 'firstName lastName');
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update leave status
// @route   PUT /api/leaves/:id
// @access  Private/Admin/HR
const updateLeaveStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const leave = await Leave.findById(req.params.id);

    if (leave) {
      leave.status = status;
      leave.approvedBy = req.user._id;
      leave.approvalDate = Date.now();
      await leave.save();
      res.json(leave);
    } else {
      res.status(404).json({ message: 'Leave request not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { applyLeave, getLeaves, updateLeaveStatus };
