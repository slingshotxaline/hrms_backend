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

// ✅ NEW: Helper to get current month key
const getCurrentMonthKey = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// ✅ NEW: Helper to check monthly leave limits
const checkMonthlyLeaveLimit = async (employee, leaveType, requestedDays, startDate) => {
  const monthKey = getCurrentMonthKey(startDate);
  
  // Get monthly usage from employee record
  const monthlyUsage = employee.monthlyLeaveUsage?.get(monthKey) || { annual: 0, casual: 0 };
  
  // ✅ Annual Leave: Max 2 days per month
  if (leaveType === 'Annual Leave') {
    const currentUsage = monthlyUsage.annual || 0;
    const totalAfterRequest = currentUsage + requestedDays;
    
    if (totalAfterRequest > 2) {
      return {
        allowed: false,
        message: `Annual Leave limit exceeded. You can only take 2 days per month. Current usage: ${currentUsage} days, Requested: ${requestedDays} days.`
      };
    }
  }
  
  // ✅ Casual Leave: Max 5 days at a time OR per month
  if (leaveType === 'Casual Leave') {
    // Check single request limit
    if (requestedDays > 5) {
      return {
        allowed: false,
        message: `Casual Leave cannot exceed 5 days at a time. Requested: ${requestedDays} days.`
      };
    }
    
    // Check monthly limit
    const currentUsage = monthlyUsage.casual || 0;
    const totalAfterRequest = currentUsage + requestedDays;
    
    if (totalAfterRequest > 5) {
      return {
        allowed: false,
        message: `Casual Leave monthly limit exceeded. You can only take 5 days per month. Current usage: ${currentUsage} days, Requested: ${requestedDays} days.`
      };
    }
  }
  
  return { allowed: true };
};

// @desc    Apply for leave
// @route   POST /api/leaves
// @access  Private
const applyLeave = async (req, res) => {
  try {
    const { leaveType, startDate, endDate, reason, isHalfDay, halfDayDate } = req.body;

    console.log(`📝 Leave application from user: ${req.user._id}`);
    console.log(`Leave Type: ${leaveType}, Half Day: ${isHalfDay}`);

    const user = await User.findById(req.user._id).populate('employeeId');
    
    if (!user.employeeId) {
      return res.status(400).json({ message: 'Employee record not found' });
    }

    const employee = await Employee.findById(user.employeeId._id || user.employeeId);

    if (!employee) {
      return res.status(400).json({ message: 'Employee details not found' });
    }

    // ✅ Handle Half Day application
    if (leaveType === 'Half Day' || isHalfDay) {
      const halfDate = halfDayDate || startDate;
      
      // Check if already applied for this day
      const existingHalfDay = await Leave.findOne({
        employee: employee._id,
        isHalfDay: true,
        halfDayDate: new Date(halfDate),
        status: { $ne: 'Rejected' }
      });
      
      if (existingHalfDay) {
        return res.status(400).json({ 
          message: 'Half day leave already applied for this date' 
        });
      }

      // Get approvers
      const approvers = await getApprovers(user._id);

      // Create half day leave
      const leave = await Leave.create({
        employee: employee._id,
        user: user._id,
        leaveType: 'Half Day',
        startDate: halfDate,
        endDate: halfDate,
        totalDays: 0.5,
        isHalfDay: true,
        halfDayDate: halfDate,
        reason,
        status: 'Pending',
        approvers,
      });

      const populatedLeave = await Leave.findById(leave._id)
        .populate('employee', 'firstName lastName employeeCode')
        .populate('user', 'name email role')
        .populate('approvers', 'name role');

      console.log(`✅ Half day leave created with ID: ${leave._id}`);

      return res.status(201).json(populatedLeave);
    }

    // ✅ Regular Leave Application
    // Calculate total days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    console.log(`📅 Leave duration: ${totalDays} days`);

    // ✅ Map leave types to balance keys
    const leaveTypeMap = {
      'Casual Leave': 'casual',
      'Sick Leave': 'sick',
      'Annual Leave': 'annual', // ✅ Changed from 'earned'
    };

    const leaveBalanceKey = leaveTypeMap[leaveType];
    
    // ✅ Check leave balance
    if (leaveBalanceKey && employee.leaveBalance[leaveBalanceKey] !== undefined) {
      const availableBalance = employee.leaveBalance[leaveBalanceKey];
      
      if (leaveType !== 'Unpaid Leave' && availableBalance < totalDays) {
        return res.status(400).json({ 
          message: `Insufficient ${leaveType} balance. Available: ${availableBalance} days, Requested: ${totalDays} days` 
        });
      }
    }

    // ✅ Check monthly limits for Annual and Casual leave
    const limitCheck = await checkMonthlyLeaveLimit(employee, leaveType, totalDays, start);
    if (!limitCheck.allowed) {
      return res.status(400).json({ message: limitCheck.message });
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
      approvers,
      isHalfDay: false,
    });

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

    // Role-based filtering
    if (req.user.role === 'Employee') {
      query.user = req.user._id;
      console.log(`👤 Employee view: Only own leaves`);
    } else if (req.user.role === 'Team Lead' || req.user.role === 'Business Lead') {
      query.$or = [
        { user: req.user._id },
        { approvers: req.user._id }
      ];
      console.log(`👔 Leader view: Own leaves + team leaves`);
    } else if (req.user.role === 'Admin' || req.user.role === 'HR') {
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
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role')
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

    // Check permissions
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
      .populate('user', 'name role')
      .populate('approvers');

    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Check if user is authorized
    const isApprover = leave.approvers.some(
      approver => approver._id.toString() === req.user._id.toString()
    );

    if (!isApprover) {
      return res.status(403).json({ 
        message: 'You are not authorized to approve/reject this leave request' 
      });
    }

    if (leave.status !== 'Pending') {
      return res.status(400).json({ 
        message: `Leave already ${leave.status.toLowerCase()} by ${leave.approvedBy?.name} (${leave.approvedByRole})` 
      });
    }

    // Update leave status
    leave.status = status;
    leave.approvedBy = req.user._id;
    leave.approvedByRole = req.user.role;
    leave.approvedAt = new Date();

    if (status === 'Rejected' && rejectionReason) {
      leave.rejectionReason = rejectionReason;
    }

    // ✅ If approved, update employee leave balance and monthly usage
    if (status === 'Approved') {
      const employee = await Employee.findById(leave.employee);
      
      const leaveTypeMap = {
        'Casual Leave': 'casual',
        'Sick Leave': 'sick',
        'Annual Leave': 'annual',
        'Unpaid Leave': 'unpaid',
      };

      const leaveBalanceKey = leaveTypeMap[leave.leaveType];
      
      // ✅ Deduct from balance (except unpaid)
      if (leaveBalanceKey && leaveBalanceKey !== 'unpaid') {
        await Employee.findByIdAndUpdate(
          leave.employee,
          {
            $inc: {
              [`leaveBalance.${leaveBalanceKey}`]: -leave.totalDays
            }
          },
          { new: true }
        );
        
        console.log(`✅ Deducted ${leave.totalDays} days from ${leaveBalanceKey} leave`);
      }

      // ✅ Update monthly usage tracking for Annual and Casual leave
      if (leave.leaveType === 'Annual Leave' || leave.leaveType === 'Casual Leave') {
        const monthKey = getCurrentMonthKey(leave.startDate);
        const usageKey = leave.leaveType === 'Annual Leave' ? 'annual' : 'casual';
        
        // Get current monthly usage
        if (!employee.monthlyLeaveUsage) {
          employee.monthlyLeaveUsage = new Map();
        }
        
        const currentMonthUsage = employee.monthlyLeaveUsage.get(monthKey) || { annual: 0, casual: 0 };
        currentMonthUsage[usageKey] = (currentMonthUsage[usageKey] || 0) + leave.totalDays;
        
        employee.monthlyLeaveUsage.set(monthKey, currentMonthUsage);
        await employee.save();
        
        console.log(`✅ Updated monthly ${leave.leaveType} usage for ${monthKey}: ${currentMonthUsage[usageKey]} days`);
      }
    }

    await leave.save();

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

// ✅ NEW: Get employee's monthly leave usage
// @desc    Get monthly leave usage for an employee
// @route   GET /api/leaves/monthly-usage/:employeeId?
// @access  Private
const getMonthlyLeaveUsage = async (req, res) => {
  try {
    let employeeId = req.params.employeeId;
    
    // If no employeeId provided, get for logged-in user
    if (!employeeId) {
      const user = await User.findById(req.user._id).populate('employeeId');
      if (!user.employeeId) {
        return res.status(400).json({ message: 'Employee record not found' });
      }
      employeeId = user.employeeId._id || user.employeeId;
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const currentMonthKey = getCurrentMonthKey();
    const monthlyUsage = employee.monthlyLeaveUsage?.get(currentMonthKey) || { annual: 0, casual: 0 };

    res.json({
      employeeId: employee._id,
      currentMonth: currentMonthKey,
      usage: monthlyUsage,
      limits: {
        annual: 2,
        casual: 5,
      },
      remaining: {
        annual: Math.max(0, 2 - (monthlyUsage.annual || 0)),
        casual: Math.max(0, 5 - (monthlyUsage.casual || 0)),
      },
      balance: employee.leaveBalance,
    });
  } catch (error) {
    console.error('❌ Error getting monthly leave usage:', error);
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
  getMonthlyLeaveUsage, // ✅ Export new function
};