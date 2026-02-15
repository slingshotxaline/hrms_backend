const Late = require('../models/Late');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const LateSettings = require('../models/LateSettings');

// Helper function to get approvers (same as leave management)
const getApprovers = async (userId) => {
  try {
    const user = await User.findById(userId).populate('reportsTo');
    
    const admins = await User.find({ role: 'Admin', isActive: true }).select('_id');
    const hrs = await User.find({ role: 'HR', isActive: true }).select('_id');
    
    const approverIds = [
      ...admins.map(a => a._id),
      ...hrs.map(h => h._id)
    ];

    if (['Employee', 'Team Lead', 'Business Lead'].includes(user.role) && user.reportsTo) {
      approverIds.push(user.reportsTo._id);
    }

    const uniqueApprovers = [...new Set(approverIds.map(id => id.toString()))];
    return uniqueApprovers;
  } catch (error) {
    console.error('Error getting approvers:', error);
    return [];
  }
};

// Helper function to count monthly lates
const getMonthlyLateCount = async (employeeId, date) => {
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);

  const lateCount = await Late.countDocuments({
    employee: employeeId,
    date: { $gte: startOfMonth, $lte: endOfMonth },
    status: { $ne: 'Rejected' } // Don't count rejected lates
  });

  return lateCount;
};

// @desc    Apply for late approval
// @route   POST /api/lates
// @access  Private
const applyLate = async (req, res) => {
  try {
    const { attendanceId, reason } = req.body;

    console.log(`📝 Late application from user: ${req.user._id}`);

    const user = await User.findById(req.user._id).populate('employeeId');
    
    if (!user.employeeId) {
      return res.status(400).json({ message: 'Employee record not found' });
    }

    // ✅ FIX: Get employee ID properly
    const employeeId = user.employeeId._id || user.employeeId;
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      return res.status(400).json({ message: 'Employee details not found' });
    }

    console.log(`✅ Employee found: ${employee.firstName} ${employee.lastName} (${employee._id})`);

    // Get attendance record
    const attendance = await Attendance.findById(attendanceId).populate('employee');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    console.log(`📋 Attendance employee ID: ${attendance.employee._id}`);
    console.log(`👤 Current employee ID: ${employee._id}`);

    // ✅ FIX: Compare string IDs properly
    const attendanceEmployeeId = attendance.employee._id.toString();
    const currentEmployeeId = employee._id.toString();

    if (attendanceEmployeeId !== currentEmployeeId) {
      console.log(`❌ Authorization failed: ${attendanceEmployeeId} !== ${currentEmployeeId}`);
      return res.status(403).json({ 
        message: 'Not authorized to apply for this attendance',
        debug: {
          attendanceEmployee: attendanceEmployeeId,
          currentEmployee: currentEmployeeId
        }
      });
    }

    if (attendance.lateMinutes <= 0) {
      return res.status(400).json({ message: 'This attendance is not marked as late' });
    }

    // Check if already applied
    const existingLate = await Late.findOne({ attendance: attendanceId });
    if (existingLate) {
      return res.status(400).json({ message: 'Late application already exists for this attendance' });
    }

    // Get approvers
    const approvers = await getApprovers(user._id);
    
    // Count monthly lates (including this one)
    const monthlyLateCount = await getMonthlyLateCount(employee._id, attendance.date) + 1;

    console.log(`📅 Monthly late count: ${monthlyLateCount}`);

    // Create late application
    const late = await Late.create({
      employee: employee._id,
      user: user._id,
      attendance: attendance._id,
      date: attendance.date,
      lateMinutes: attendance.lateMinutes,
      reason,
      status: 'Pending',
      approvers,
      monthlyLateCount,
    });

    const populatedLate = await Late.findById(late._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('user', 'name email role')
      .populate('attendance', 'date lateMinutes timingStatus')
      .populate('approvers', 'name role');

    console.log(`✅ Late application created with ID: ${late._id}`);

    res.status(201).json(populatedLate);
  } catch (error) {
    console.error('❌ Error applying for late:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all late applications (with filtering)
// @route   GET /api/lates
// @access  Private
const getLates = async (req, res) => {
  try {
    const { status, employeeId, startDate, endDate } = req.query;
    const query = {};

    console.log(`🔍 Getting lates for user: ${req.user.name} (${req.user.role})`);

    // Role-based filtering
    if (req.user.role === 'Employee') {
      query.user = req.user._id;
    } else if (req.user.role === 'Team Lead' || req.user.role === 'Business Lead') {
      query.$or = [
        { user: req.user._id },
        { approvers: req.user._id }
      ];
    }
    // Admin and HR see all

    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;
    if (startDate && endDate) {
      query.date = { 
        $gte: new Date(startDate), 
        $lte: new Date(endDate) 
      };
    }

    const lates = await Late.find(query)
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('user', 'name email role')
      .populate('attendance', 'date inTime lateMinutes timingStatus')
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${lates.length} late applications`);

    res.json(lates);
  } catch (error) {
    console.error('❌ Error getting lates:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get late by ID
// @route   GET /api/lates/:id
// @access  Private
const getLateById = async (req, res) => {
  try {
    const late = await Late.findById(req.params.id)
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('user', 'name email role')
      .populate('attendance', 'date inTime lateMinutes timingStatus')
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role');

    if (!late) {
      return res.status(404).json({ message: 'Late application not found' });
    }

    // Check permissions
    const canView = 
      req.user.role === 'Admin' ||
      req.user.role === 'HR' ||
      late.user._id.toString() === req.user._id.toString() ||
      late.approvers.some(a => a._id.toString() === req.user._id.toString());

    if (!canView) {
      return res.status(403).json({ message: 'Not authorized to view this late application' });
    }

    res.json(late);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve/Reject late application
// @route   PUT /api/lates/:id
// @access  Private (Admin/HR/Approver)
const updateLateStatus = async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    console.log(`🔄 Updating late ${req.params.id} to ${status} by ${req.user.name} (${req.user.role})`);

    const late = await Late.findById(req.params.id)
      .populate('employee')
      .populate('user', 'name role')
      .populate('approvers');

    if (!late) {
      return res.status(404).json({ message: 'Late application not found' });
    }

    // Check if user is authorized
    const isApprover = late.approvers.some(
      approver => approver._id.toString() === req.user._id.toString()
    );

    if (!isApprover) {
      return res.status(403).json({ 
        message: 'You are not authorized to approve/reject this late application' 
      });
    }

    if (late.status !== 'Pending') {
      return res.status(400).json({ 
        message: `Late already ${late.status.toLowerCase()} by ${late.approvedBy?.name} (${late.approvedByRole})` 
      });
    }

    late.status = status;
    late.approvedBy = req.user._id;
    late.approvedByRole = req.user.role;
    late.approvedAt = new Date();

    if (status === 'Rejected' && rejectionReason) {
      late.rejectionReason = rejectionReason;
    }

    await late.save();

    const updatedLate = await Late.findById(late._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('user', 'name email role')
      .populate('attendance', 'date lateMinutes timingStatus')
      .populate('approvedBy', 'name role')
      .populate('approvers', 'name role');

    console.log(`✅ Late ${status} successfully`);

    res.json(updatedLate);
  } catch (error) {
    console.error('❌ Error updating late status:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete late application
// @route   DELETE /api/lates/:id
// @access  Private
const deleteLate = async (req, res) => {
  try {
    const late = await Late.findById(req.params.id);

    if (!late) {
      return res.status(404).json({ message: 'Late application not found' });
    }

    if (late.user.toString() !== req.user._id.toString() || late.status !== 'Pending') {
      return res.status(403).json({ 
        message: 'You can only delete your own pending late applications' 
      });
    }

    await late.deleteOne();
    res.json({ message: 'Late application deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get late settings
// @route   GET /api/lates/settings
// @access  Private/Admin
const getLateSettings = async (req, res) => {
  try {
    let settings = await LateSettings.findOne({ organization: 'default' });
    
    if (!settings) {
      // Create default settings
      settings = await LateSettings.create({
        organization: 'default',
        deductionPreference: 'Leave',
        graceDaysPerMonth: 2,
        lateThresholdMinutes: 1,
        autoApproveUnder: 0,
        isEnabled: true,
      });
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update late settings
// @route   PUT /api/lates/settings
// @access  Private/Admin
const updateLateSettings = async (req, res) => {
  try {
    const { 
      deductionPreference, 
      graceDaysPerMonth, 
      lateThresholdMinutes,
      autoApproveUnder,
      isEnabled 
    } = req.body;

    let settings = await LateSettings.findOne({ organization: 'default' });
    
    if (!settings) {
      settings = await LateSettings.create({
        organization: 'default',
        deductionPreference,
        graceDaysPerMonth,
        lateThresholdMinutes,
        autoApproveUnder,
        isEnabled,
      });
    } else {
      if (deductionPreference) settings.deductionPreference = deductionPreference;
      if (graceDaysPerMonth !== undefined) settings.graceDaysPerMonth = graceDaysPerMonth;
      if (lateThresholdMinutes !== undefined) settings.lateThresholdMinutes = lateThresholdMinutes;
      if (autoApproveUnder !== undefined) settings.autoApproveUnder = autoApproveUnder;
      if (isEnabled !== undefined) settings.isEnabled = isEnabled;
      
      await settings.save();
    }

    console.log(`✅ Late settings updated by ${req.user.name}`);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Calculate late deductions for an employee in a month
// @route   GET /api/lates/calculate-deductions/:employeeId/:month
// @access  Private/Admin/HR
const calculateLateDeductions = async (req, res) => {
  try {
    const { employeeId, month } = req.params; // month format: YYYY-MM

    const [year, monthNum] = month.split('-').map(Number);
    const startOfMonth = new Date(year, monthNum - 1, 1);
    const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59);

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get late settings
    const settings = await LateSettings.findOne({ organization: 'default' });
    const graceDays = settings?.graceDaysPerMonth || 2;
    const deductionPref = settings?.deductionPreference || 'Leave';

    // Get all lates for this month (excluding rejected and approved ones)
    const lates = await Late.find({
      employee: employeeId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $ne: 'Rejected' }
    }).sort({ date: 1 });

    // Separate approved and unapproved lates
    const approvedLates = lates.filter(l => l.status === 'Approved');
    const unapprovedLates = lates.filter(l => l.status === 'Pending');

    // Only unapproved lates count for deduction
    const deductibleLates = unapprovedLates.filter((_, index) => index >= graceDays);

    let totalSalaryDeduction = 0;
    let totalLeaveDeduction = 0;
    const deductions = [];

    // Calculate per-day salary
    const perDaySalary = employee.basicSalary / 30;

    // Available earned leave
    let availableEarnedLeave = employee.leaveBalance.earned || 0;

    deductibleLates.forEach((late, index) => {
      const lateNumber = index + graceDays + 1; // 3rd, 4th, 5th, etc.
      
      let deductionType = 'None';
      let deductionAmount = 0;

      if (deductionPref === 'Salary') {
        // Always deduct salary
        deductionType = 'Salary';
        deductionAmount = perDaySalary;
        totalSalaryDeduction += perDaySalary;
      } else if (deductionPref === 'Leave') {
        // Deduct leave if available, otherwise salary
        if (availableEarnedLeave > 0) {
          deductionType = 'Leave';
          deductionAmount = 1;
          totalLeaveDeduction += 1;
          availableEarnedLeave -= 1;
        } else {
          deductionType = 'Salary';
          deductionAmount = perDaySalary;
          totalSalaryDeduction += perDaySalary;
        }
      }

      deductions.push({
        lateId: late._id,
        date: late.date,
        lateNumber,
        lateMinutes: late.lateMinutes,
        deductionType,
        deductionAmount,
      });
    });

    res.json({
      employee: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        employeeCode: employee.employeeCode,
        basicSalary: employee.basicSalary,
        perDaySalary,
        earnedLeaveBalance: employee.leaveBalance.earned,
      },
      month,
      settings: {
        graceDaysPerMonth: graceDays,
        deductionPreference: deductionPref,
      },
      summary: {
        totalLates: lates.length,
        approvedLates: approvedLates.length,
        unapprovedLates: unapprovedLates.length,
        deductibleLates: deductibleLates.length,
        totalSalaryDeduction: Math.round(totalSalaryDeduction),
        totalLeaveDeduction,
      },
      deductions,
    });
  } catch (error) {
    console.error('❌ Error calculating deductions:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get late deduction report for all employees in a month
// @route   GET /api/lates/report/:month
// @access  Private/Admin/HR
const getLateDeductionReport = async (req, res) => {
  try {
    const { month } = req.params; // Format: YYYY-MM

    const [year, monthNum] = month.split('-').map(Number);
    const startOfMonth = new Date(year, monthNum - 1, 1);
    const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59);

    console.log(`📊 Generating late deduction report for ${month}`);

    // Get all active employees
    const employees = await Employee.find({ isActive: true });

    // Get late settings
    const settings = await LateSettings.findOne({ organization: 'default' });
    const graceDays = settings?.graceDaysPerMonth || 2;
    const deductionPref = settings?.deductionPreference || 'Leave';

    const report = [];

    for (const employee of employees) {
      // Get all lates for this employee this month
      const lates = await Late.find({
        employee: employee._id,
        date: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $ne: 'Rejected' }
      }).sort({ date: 1 });

      const approvedLates = lates.filter(l => l.status === 'Approved');
      const pendingLates = lates.filter(l => l.status === 'Pending');
      const deductibleLates = pendingLates.filter((_, index) => index >= graceDays);

      let totalSalaryDeduction = 0;
      let totalLeaveDeduction = 0;

      deductibleLates.forEach(late => {
        if (late.isDeducted) {
          if (late.deductionType === 'Salary') {
            totalSalaryDeduction += late.deductionAmount;
          } else if (late.deductionType === 'Leave') {
            totalLeaveDeduction += late.deductionAmount;
          }
        }
      });

      if (lates.length > 0) {
        report.push({
          employee: {
            _id: employee._id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            employeeCode: employee.employeeCode,
            department: employee.department,
            basicSalary: employee.basicSalary,
          },
          summary: {
            totalLates: lates.length,
            approvedLates: approvedLates.length,
            pendingLates: pendingLates.length,
            deductibleLates: deductibleLates.length,
            graceDaysUsed: Math.min(pendingLates.length, graceDays),
            totalSalaryDeduction: Math.round(totalSalaryDeduction),
            totalLeaveDeduction,
          },
          lates: deductibleLates.map(l => ({
            date: l.date,
            lateMinutes: l.lateMinutes,
            status: l.status,
            isDeducted: l.isDeducted,
            deductionType: l.deductionType,
            deductionAmount: l.deductionAmount,
          })),
        });
      }
    }

    // Sort by total deductions (highest first)
    report.sort((a, b) => {
      const aTotal = a.summary.totalSalaryDeduction + (a.summary.totalLeaveDeduction * (a.employee.basicSalary / 30));
      const bTotal = b.summary.totalSalaryDeduction + (b.summary.totalLeaveDeduction * (b.employee.basicSalary / 30));
      return bTotal - aTotal;
    });

    console.log(`✅ Generated report for ${report.length} employees with late deductions`);

    res.json({
      month,
      settings: {
        graceDaysPerMonth: graceDays,
        deductionPreference: deductionPref,
      },
      totalEmployeesWithLates: report.length,
      report,
    });
  } catch (error) {
    console.error('❌ Error generating late deduction report:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  applyLate,
  getLates,
  getLateById,
  updateLateStatus,
  deleteLate,
  getLateSettings,
  updateLateSettings,
  calculateLateDeductions,
  getLateDeductionReport,
};