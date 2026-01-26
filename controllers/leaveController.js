const Leave = require('../models/Leave');

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private/Employee
const applyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason, employeeId } = req.body;

    // Use employeeId from request body (for admin/HR creating leaves for others)
    // Or use the logged-in user's employeeId
    const empId = employeeId || req.user.employeeId;

    if (!empId) {
      return res.status(400).json({ message: 'No employee record found' });
    }

    const leave = await Leave.create({
      employee: empId,
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
    const { employeeId } = req.query;
    
    let query = {};
    
    // If employeeId is provided in query, filter by that
    if (employeeId) {
      query.employee = employeeId;
    }
    // If user is regular employee (not Admin/HR), only show their leaves
    else if (req.user.role === 'Employee' && req.user.employeeId) {
      query.employee = req.user.employeeId;
    }
    // Admin/HR can see all leaves if no filter is applied
    
    const leaves = await Leave.find(query)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    
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