const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const User = require('../models/User');

// ✅ Helper function to determine approvers based on employee role
const getApprovers = async (userId) => {
  try {
    const user = await User.findById(userId).populate('reportsTo');
    
    console.log(`🔍 Getting approvers for user: ${user.name} (${user.role})`);
    
    // Get all admins and HR
    const admins = await User.find({ role: 'Admin', isActive: true }).select('_id');
    const hrs = await User.find({ role: 'HR', isActive: true }).select('_id');
    
    const approverIds = [
      ...admins.map(a => a._id),
      ...hrs.map(h => h._id)
    ];

    // If employee is regular employee or Team Lead or Business Lead, add their direct manager
    if (['Employee', 'Team Lead', 'Business Lead'].includes(user.role) && user.reportsTo) {
      console.log(`✅ Adding direct manager: ${user.reportsTo._id}`);
      approverIds.push(user.reportsTo._id);
    }

    // Remove duplicates
    const uniqueApprovers = [...new Set(approverIds.map(id => id.toString()))];
    console.log(`✅ Total approvers: ${uniqueApprovers.length}`);
    
    return uniqueApprovers;
  } catch (error) {
    console.error('Error getting approvers:', error);
    return [];
  }
};

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
const applyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason } = req.body;

    console.log(`📝 Leave application from user: ${req.user._id}`);

    const user = await User.findById(req.user._id).populate('employeeId');
    
    if (!user.employeeId) {
      return res.status(400).json({ message: 'Employee record not found' });
    }

    const employee = await Employee.findById(user.employeeId._id || user.employeeId);

    if (!employee) {
      return res.status(400).json({ message: 'Employee details not found' });
    }

    // Calculate total days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    console.log(`📅 Leave duration: ${totalDays} days`);

    // Check leave balance
    const leaveTypeMap = {
      'Casual Leave': 'casual',
      'Sick Leave': 'sick',
      'Earned Leave': 'earned',
    };

    const leaveBalanceKey = leaveTypeMap[leaveType];
    
    if (leaveBalanceKey && employee.leaveBalance[leaveBalanceKey] !== undefined) {
      const availableBalance = employee.leaveBalance[leaveBalanceKey];
      if (leaveType !== 'Unpaid Leave' && availableBalance < totalDays) {
        return res.status(400).json({ 
          message: `Insufficient leave balance. Available: ${availableBalance} days, Requested: ${totalDays} days` 
        });
      }
    }

    // ✅ Get approvers for this leave request
    const approvers = await getApprovers(user._id);
    
    console.log(`📋 Leave applied by ${user.name} (${user.role})`);
    console.log(`✅ Approvers: ${approvers.length} users`);

    // Create leave request
    const leave = await Leave.create({
      employee: employee._id,
      user: user._id,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason,
      status: 'Pending',
      approvers, // ✅ Store who can approve this leave
    });

    // Populate the leave data
    const populatedLeave = await Leave.findById(leave._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('user', 'name email role')
      .populate('approvers', 'name role');

    console.log(`✅ Leave created with ID: ${leave._id}`);

    res.status(201).json(populatedLeave);
  } catch (error) {
    console.error('❌ Error applying leave:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all leaves (with filtering)
// @route   GET /api/leaves
// @access  Private
const getLeaves = async (req, res) => {
  try {
    const { status, employeeId, startDate, endDate } = req.query;
    const query = {};

    console.log(`🔍 Getting leaves for user: ${req.user.name} (${req.user.role})`);

    // ✅ Role-based filtering
    if (req.user.role === 'Employee') {
      // Regular employees see only their own leaves
      query.user = req.user._id;
      console.log(`👤 Employee view: Only own leaves`);
    } else if (req.user.role === 'Team Lead' || req.user.role === 'Business Lead') {
      // ✅ Team/Business leads see:
      // 1. Their own leaves
      // 2. Leaves where they are an approver (their team members)
      query.$or = [
        { user: req.user._id }, // Own leaves
        { approvers: req.user._id } // Leaves they can approve
      ];
      console.log(`👔 Leader view: Own leaves + team leaves where they are approver`);
    } else if (req.user.role === 'Admin' || req.user.role === 'HR') {
      // Admin and HR see all leaves
      console.log(`👑 Admin/HR view: All leaves`);
    }

    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;
    if (startDate && endDate) {
      query.startDate = { $gte: new Date(startDate) };
      query.endDate = { $lte: new Date(endDate) };
    }

    const leaves = await Leave.find(query)
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('user', 'name email role')
      .populate('approvedBy', 'name role') // ✅ Populate who approved
      .populate('approvers', 'name role') // ✅ Populate who can approve
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${leaves.length} leaves`);

    res.json(leaves);
  } catch (error) {
    console.error('❌ Error getting leaves:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get leave by ID
// @route   GET /api/leaves/:id
// @access  Private
const getLeaveById = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('user', 'name email role')
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role');

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Check if user has permission to view this leave
    const canView = 
      req.user.role === 'Admin' ||
      req.user.role === 'HR' ||
      leave.user._id.toString() === req.user._id.toString() ||
      leave.approvers.some(a => a._id.toString() === req.user._id.toString());

    if (!canView) {
      return res.status(403).json({ message: 'Not authorized to view this leave' });
    }

    res.json(leave);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve/Reject leave
// @route   PUT /api/leaves/:id
// @access  Private (Admin/HR/Approver)
const updateLeaveStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    console.log(`🔄 Updating leave ${req.params.id} to ${status} by ${req.user.name} (${req.user.role})`);

    const leave = await Leave.findById(req.params.id)
      .populate('employee')
      .populate('user', 'name role')
      .populate('approvers');

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    console.log(`📋 Leave approvers: ${leave.approvers.map(a => `${a.name} (${a.role})`).join(', ')}`);

    // ✅ Check if user is authorized to approve this leave
    const isApprover = leave.approvers.some(
      approver => approver._id.toString() === req.user._id.toString()
    );

    console.log(`🔐 Is user an approver? ${isApprover}`);

    if (!isApprover) {
      return res.status(403).json({ 
        message: 'You are not authorized to approve/reject this leave request' 
      });
    }

    // ✅ Check if leave is already approved/rejected
    if (leave.status !== 'Pending') {
      return res.status(400).json({ 
        message: `Leave already ${leave.status.toLowerCase()} by ${leave.approvedBy?.name} (${leave.approvedByRole})` 
      });
    }

    // Update leave status
    leave.status = status;
    leave.approvedBy = req.user._id;
    leave.approvedByRole = req.user.role; // ✅ Store approver's role
    leave.approvedAt = new Date();

    if (status === 'Rejected' && rejectionReason) {
      leave.rejectionReason = rejectionReason;
    }

    // If approved, update employee leave balance
    if (status === 'Approved') {
      const employee = leave.employee;
      const leaveTypeMap = {
        'Casual Leave': 'casual',
        'Sick Leave': 'sick',
        'Earned Leave': 'earned',
        'Unpaid Leave': 'unpaid',
      };

      const leaveBalanceKey = leaveTypeMap[leave.leaveType];
      
      if (leaveBalanceKey && leaveBalanceKey !== 'unpaid' && employee.leaveBalance[leaveBalanceKey] !== undefined) {
        employee.leaveBalance[leaveBalanceKey] -= leave.totalDays;
        
        if (employee.leaveBalance[leaveBalanceKey] < 0) {
          employee.leaveBalance[leaveBalanceKey] = 0;
        }
        
        await employee.save();
        console.log(`✅ Deducted ${leave.totalDays} days from ${leaveBalanceKey} leave`);
      }
    }

    await leave.save();

    // Populate the updated leave
    const updatedLeave = await Leave.findById(leave._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('user', 'name email role')
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role');

    console.log(`✅ Leave ${status} successfully`);

    res.json(updatedLeave);
  } catch (error) {
    console.error('❌ Error updating leave status:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete leave
// @route   DELETE /api/leaves/:id
// @access  Private
const deleteLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Only the applicant can delete their own pending leave
    if (leave.user.toString() !== req.user._id.toString() || leave.status !== 'Pending') {
      return res.status(403).json({ 
        message: 'You can only delete your own pending leave requests' 
      });
    }

    await leave.deleteOne();
    res.json({ message: 'Leave deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get my pending approvals
// @route   GET /api/leaves/pending-approvals
// @access  Private (Admin/HR/Team Lead/Business Lead)
const getPendingApprovals = async (req, res) => {
  try {
    console.log(`🔍 Getting pending approvals for ${req.user.name} (${req.user.role})`);
    
    // Find all pending leaves where current user is an approver
    const pendingLeaves = await Leave.find({
      status: 'Pending',
      approvers: req.user._id
    })
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('user', 'name email role')
      .populate('approvers', 'name role')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${pendingLeaves.length} pending approvals`);

    res.json(pendingLeaves);
  } catch (error) {
    console.error('❌ Error getting pending approvals:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  applyLeave,
  getLeaves,
  getLeaveById,
  updateLeaveStatus,
  deleteLeave,
  getPendingApprovals,
};