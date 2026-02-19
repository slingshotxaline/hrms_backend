const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Late = require('../models/Late'); // ✅ ADD THIS
const LateSettings = require('../models/LateSettings'); // ✅ ADD THIS

// @desc    Generate Payroll for a specific month/year
// @route   POST /api/payroll/generate
// @access  Private/Admin/HR
const generatePayroll = async (req, res) => {
  try {
    const { month, year, regenerate = false, reason = '' } = req.body;

    console.log(`💰 ${regenerate ? 'Regenerating' : 'Generating'} payroll for ${month}/${year}`);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const daysInMonth = endDate.getDate();

    console.log(`📅 Processing ${daysInMonth} days from ${startDate.toDateString()} to ${endDate.toDateString()}`);

    const employees = await Employee.find({ isActive: true });
    console.log(`👥 Found ${employees.length} active employees`);

    // Get late settings
    const lateSettings = await LateSettings.findOne({ organization: 'default' });
    const graceDaysPerMonth = lateSettings?.graceDaysPerMonth || 2;
    const deductionPreference = lateSettings?.deductionPreference || 'Leave';

    const payrollRecords = [];
    let regeneratedCount = 0;
    let newCount = 0;

    for (const employee of employees) {
      console.log(`\n📊 Processing payroll for ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`);

      // Check if payroll already exists
      const existingPayroll = await Payroll.findOne({
        employee: employee._id,
        month: new Date(year, month - 1, 1),
      });

      if (existingPayroll && !regenerate) {
        console.log(`⏭️ Payroll already exists for ${employee.employeeCode}, skipping...`);
        continue;
      }

      // Get attendance records for the month
      const attendanceRecords = await Attendance.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
      });

      // Count attendance
      const presentDays = attendanceRecords.filter(a => a.status === 'Present').length;
      const absentDays = attendanceRecords.filter(a => a.status === 'Absent').length;
      const leaveDays = attendanceRecords.filter(a => a.status === 'Leave').length;
      
      // ✅ Count half days from attendance
      const halfDaysFromAttendance = attendanceRecords.filter(a => a.isHalfDay).length;

      // ✅ Count approved half day leaves
      const approvedHalfDayLeaves = await Leave.countDocuments({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
        leaveType: 'Half Day',
        status: 'Approved',
      });

      const totalHalfDays = halfDaysFromAttendance + approvedHalfDayLeaves;

      console.log(`   Present: ${presentDays}, Absent: ${absentDays}, Leave: ${leaveDays}, Half Days: ${totalHalfDays}`);

      // ✅ Calculate overtime (FOR INFORMATION ONLY - NOT ADDED TO SALARY)
      const totalOvertimeMinutes = attendanceRecords.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
      const overtimeHours = totalOvertimeMinutes / 60;
      const overtimeAmount = (employee.basicSalary / 30 / 8) * overtimeHours * 1.5;

      console.log(`   ℹ️ Overtime: ${overtimeHours.toFixed(2)} hours (FOR INFO ONLY - NOT ADDED TO SALARY)`);

      // ✅ Calculate late deductions from ANNUAL leave
      const lates = await Late.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
        status: { $ne: 'Rejected' }
      }).sort({ date: 1 });

      const approvedLates = lates.filter(l => l.status === 'Approved');
      const pendingLates = lates.filter(l => l.status === 'Pending');
      const deductibleLates = pendingLates.filter((_, index) => index >= graceDaysPerMonth);

      let lateSalaryDeduction = 0;
      let lateLeaveDeduction = 0;
      let availableAnnualLeave = employee.leaveBalance.annual || 0; // ✅ Changed from earned
      const perDaySalary = employee.basicSalary / 30;

      console.log(`   🕐 Total lates: ${lates.length}, Approved: ${approvedLates.length}, Deductible: ${deductibleLates.length}`);

      // ✅ Process deductible lates
      for (let i = 0; i < deductibleLates.length; i++) {
        const late = deductibleLates[i];
        
        if (deductionPreference === 'Salary') {
          lateSalaryDeduction += perDaySalary;
          late.isDeducted = true;
          late.deductionType = 'Salary';
          late.deductionAmount = perDaySalary;
          await late.save();
        } else if (deductionPreference === 'Leave') {
          // ✅ Deduct from ANNUAL leave if available
          if (availableAnnualLeave > 0) {
            lateLeaveDeduction += 1;
            availableAnnualLeave -= 1;
            late.isDeducted = true;
            late.deductionType = 'Leave';
            late.deductionAmount = 1;
            await late.save();
          } else {
            // ✅ If no annual leave, deduct salary
            lateSalaryDeduction += perDaySalary;
            late.isDeducted = true;
            late.deductionType = 'Salary';
            late.deductionAmount = perDaySalary;
            await late.save();
          }
        }
      }

      // ✅ Update employee annual leave balance if deducted
      if (lateLeaveDeduction > 0) {
        employee.leaveBalance.annual -= lateLeaveDeduction;
        await employee.save();
        console.log(`   ✅ Deducted ${lateLeaveDeduction} annual leave(s) for late arrivals`);
      }

      // ✅ Calculate HALF DAY deductions
      // Rule: 2 half days = 1 annual leave OR 1 day salary
      const halfDayPairs = Math.floor(totalHalfDays / 2);
      let halfDaySalaryDeduction = 0;
      let halfDayLeaveDeduction = 0;

      if (halfDayPairs > 0) {
        if (deductionPreference === 'Salary') {
          halfDaySalaryDeduction = halfDayPairs * perDaySalary;
        } else if (deductionPreference === 'Leave') {
          // Check if enough annual leave
          if (availableAnnualLeave >= halfDayPairs) {
            halfDayLeaveDeduction = halfDayPairs;
            availableAnnualLeave -= halfDayPairs;
          } else {
            // Deduct available leave first, then salary
            halfDayLeaveDeduction = availableAnnualLeave;
            const remainingPairs = halfDayPairs - availableAnnualLeave;
            halfDaySalaryDeduction = remainingPairs * perDaySalary;
            availableAnnualLeave = 0;
          }
        }

        // Update employee leave balance
        if (halfDayLeaveDeduction > 0) {
          employee.leaveBalance.annual -= halfDayLeaveDeduction;
          await employee.save();
          console.log(`   ✅ Deducted ${halfDayLeaveDeduction} annual leave(s) for ${totalHalfDays} half days`);
        }

        console.log(`   📅 Half Days: ${totalHalfDays} (${halfDayPairs} pairs)`);
        console.log(`   💸 Half Day Deduction: Salary: ৳${Math.round(halfDaySalaryDeduction)}, Leave: ${halfDayLeaveDeduction}`);
      }

      // Calculate regular deductions
      const absentDeduction = (employee.basicSalary / daysInMonth) * absentDays;

      const totalAllowances = 
        (employee.allowances?.houseRent || 0) + 
        (employee.allowances?.medical || 0) + 
        (employee.allowances?.transport || 0);

      const grossSalary = employee.basicSalary + totalAllowances;
      
      // ✅ Total deductions (note: NO early leave deduction, NO overtime addition)
      const totalDeductions = absentDeduction + lateSalaryDeduction + halfDaySalaryDeduction;
      
      // ✅ Net salary (overtime NOT added)
      const netSalary = grossSalary - totalDeductions;

      console.log(`   💰 Gross: ৳${grossSalary}, Deductions: ৳${Math.round(totalDeductions)}, Net: ৳${Math.round(netSalary)}`);
      console.log(`   ℹ️ Overtime tracked but NOT added to salary`);

      const payrollData = {
        employee: employee._id,
        month: new Date(year, month - 1, 1),
        basicSalary: employee.basicSalary,
        allowances: {
          houseRent: employee.allowances?.houseRent || 0,
          medical: employee.allowances?.medical || 0,
          transport: employee.allowances?.transport || 0,
        },
        totalAllowances,
        grossSalary,
        deductions: {
          absent: Math.round(absentDeduction),
          halfDay: Math.round(halfDaySalaryDeduction), // ✅ Half day deduction
          late: Math.round(lateSalaryDeduction),
        },
        totalDeductions: Math.round(totalDeductions),
        overtime: {
          hours: Math.round(overtimeHours * 10) / 10,
          amount: Math.round(overtimeAmount), // ✅ For info only
        },
        netSalary: Math.round(netSalary),
        attendance: {
          present: presentDays,
          absent: absentDays,
          leave: leaveDays,
          halfDay: totalHalfDays,
          late: deductibleLates.length,
          lateApproved: approvedLates.length,
        },
        status: 'Pending',
        adjustments: [], // ✅ Empty initially
        totalAdjustments: 0,
      };

      // Update existing or create new
      if (existingPayroll) {
        const previousNetSalary = existingPayroll.netSalary;
        const changes = {
          basicSalary: { old: existingPayroll.basicSalary, new: payrollData.basicSalary },
          netSalary: { old: existingPayroll.netSalary, new: payrollData.netSalary },
          deductions: { old: existingPayroll.totalDeductions, new: payrollData.totalDeductions },
          overtime: { old: existingPayroll.overtime.amount, new: payrollData.overtime.amount },
        };

        existingPayroll.regenerationHistory.push({
          regeneratedAt: new Date(),
          regeneratedBy: req.user._id,
          reason: reason || 'Payroll regenerated',
          previousNetSalary,
          newNetSalary: payrollData.netSalary,
          changes,
        });

        Object.assign(existingPayroll, payrollData);
        existingPayroll.isRegenerated = true;
        existingPayroll.version += 1;

        await existingPayroll.save();
        payrollRecords.push(existingPayroll);
        regeneratedCount++;
        
        console.log(`   🔄 Regenerated payroll (v${existingPayroll.version})`);
      } else {
        const newPayroll = await Payroll.create(payrollData);
        payrollRecords.push(newPayroll);
        newCount++;
        
        console.log(`   ✅ Created new payroll`);
      }
    }

    console.log(`\n✅ Payroll processing complete:`);
    console.log(`   New: ${newCount}, Regenerated: ${regeneratedCount}`);

    res.status(201).json({
      message: regenerate ? 'Payroll regenerated successfully' : 'Payroll generated successfully',
      summary: {
        total: payrollRecords.length,
        new: newCount,
        regenerated: regeneratedCount,
      },
      payrolls: payrollRecords,
    });
  } catch (error) {
    console.error('❌ Error generating payroll:', error);
    res.status(500).json({ message: error.message });
  }
};



// Helper function to calculate working days (excluding weekends and holidays)
function getWorkingDays(year, month, holidays) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  let workingDays = 0;

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
    
    // Check if it's a holiday
    const isHoliday = holidays.some(holiday => {
      const holidayDate = new Date(holiday.date);
      return holidayDate.toDateString() === d.toDateString();
    });

    if (!isWeekend && !isHoliday) {
      workingDays++;
    }
  }

  return workingDays;
}

// Helper function to calculate absent deduction
function calculateAbsentDeduction(absentDays, basicSalary, workingDays) {
  if (absentDays === 0 || workingDays === 0) return 0;
  const perDaySalary = basicSalary / workingDays;
  return Math.round(perDaySalary * absentDays);
}

// Helper function to calculate late deduction
function calculateLateDeduction(totalLateMinutes, basicSalary, workingDays) {
  if (totalLateMinutes === 0 || workingDays === 0) return 0;
  
  // Deduct for every 30 minutes late (configurable)
  const lateHours = totalLateMinutes / 60;
  const perHourSalary = basicSalary / (workingDays * 8); // Assuming 8-hour workday
  
  return Math.round(perHourSalary * lateHours);
}

// Helper function to calculate tax (simplified - use your country's tax rules)
function calculateTax(totalEarnings) {
  // Simple progressive tax calculation
  if (totalEarnings <= 30000) return 0;
  if (totalEarnings <= 50000) return totalEarnings * 0.05;
  if (totalEarnings <= 100000) return totalEarnings * 0.10;
  return totalEarnings * 0.15;
}

// Helper function to calculate provident fund
function calculateProvidentFund(basicSalary) {
  // Typically 10-12% of basic salary
  return Math.round(basicSalary * 0.10);
}

// @desc    Get Payroll Records
// @route   GET /api/payroll
// @access  Private
const getPayroll = async (req, res) => {
  try {
    const { month, year, employeeId, status } = req.query;
    const query = {};

    if (month && year) {
      query.month = new Date(year, month - 1, 1);
    }
    if (employeeId) {
      query.employee = employeeId;
    }
    if (status) {
      query.status = status;
    }

    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName employeeCode department')
      .populate('regenerationHistory.regeneratedBy', 'name role')
      .sort({ month: -1, createdAt: -1 });

    res.json(payrolls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @desc    Get payroll by ID with regeneration history
// @route   GET /api/payroll/:id
// @access  Private
const getPayrollById = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id)
      .populate('employee')
      .populate('regenerationHistory.regeneratedBy', 'name role email');

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    res.json(payroll);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update payroll status
// @route   PUT /api/payroll/:id/status
// @access  Private/Admin
const updatePayrollStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const payroll = await Payroll.findById(req.params.id);

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    payroll.status = status;
    
    if (status === 'Paid') {
      payroll.paidAt = new Date();
    }

    await payroll.save();

    res.json(payroll);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete payroll (only if Pending)
// @route   DELETE /api/payroll/:id
// @access  Private/Admin
const deletePayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    if (payroll.status !== 'Pending') {
      return res.status(400).json({ 
        message: 'Cannot delete payroll that is not in Pending status' 
      });
    }

    await payroll.deleteOne();
    res.json({ message: 'Payroll deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Bulk regenerate for all employees
// @route   POST /api/payroll/regenerate-all
// @access  Private/Admin
const regenerateAllPayroll = async (req, res) => {
  try {
    const { month, year, reason } = req.body;

    console.log(`🔄 Bulk regenerating payroll for ${month}/${year}`);

    // Call the generate function with regenerate flag
    req.body.regenerate = true;
    await generatePayroll(req, res);
  } catch (error) {
    console.error('❌ Error regenerating all payroll:', error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Regenerate single employee payroll
// @route   POST /api/payroll/regenerate/:employeeId
// @access  Private/Admin/HR
const regenerateEmployeePayroll = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { month, year, reason } = req.body;

    console.log(`🔄 Regenerating payroll for employee ${employeeId} for ${month}/${year}`);

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get existing payroll
    const existingPayroll = await Payroll.findOne({
      employee: employeeId,
      month: new Date(year, month - 1, 1),
    });

    if (!existingPayroll) {
      return res.status(404).json({ message: 'Payroll not found for this month' });
    }

    // Date range
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Recalculate everything (same logic as generate)
    const attendanceRecords = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate },
    });

    const presentDays = attendanceRecords.filter(a => a.status === 'Present').length;
    const absentDays = attendanceRecords.filter(a => a.status === 'Absent').length;
    const leaveDays = attendanceRecords.filter(a => a.status === 'Leave').length;
    const halfDays = attendanceRecords.filter(a => a.isHalfDay).length;

    const totalOvertimeMinutes = attendanceRecords.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
    const overtimeHours = totalOvertimeMinutes / 60;
    const overtimeAmount = (employee.basicSalary / 30 / 8) * overtimeHours * 1.5;

    // Late deductions
    const lateSettings = await LateSettings.findOne({ organization: 'default' });
    const graceDaysPerMonth = lateSettings?.graceDaysPerMonth || 2;
    const deductionPreference = lateSettings?.deductionPreference || 'Leave';

    const lates = await Late.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate },
      status: { $ne: 'Rejected' }
    });

    const approvedLates = lates.filter(l => l.status === 'Approved');
    const unapprovedLates = lates.filter(l => l.status === 'Pending');
    const deductibleLates = unapprovedLates.filter((_, index) => index >= graceDaysPerMonth);

    let lateSalaryDeduction = 0;
    const perDaySalary = employee.basicSalary / 30;

    deductibleLates.forEach(late => {
      if (deductionPreference === 'Salary' || employee.leaveBalance.earned <= 0) {
        lateSalaryDeduction += perDaySalary;
      }
    });

    // Calculate deductions
    const daysInMonth = endDate.getDate();
    const absentDeduction = (employee.basicSalary / daysInMonth) * absentDays;
    const halfDayDeduction = (employee.basicSalary / daysInMonth) * halfDays * 0.5;

    const totalAllowances = 
      (employee.allowances?.houseRent || 0) + 
      (employee.allowances?.medical || 0) + 
      (employee.allowances?.transport || 0);

    const grossSalary = employee.basicSalary + totalAllowances;
    const totalDeductions = absentDeduction + halfDayDeduction + lateSalaryDeduction;
    const netSalary = grossSalary + overtimeAmount - totalDeductions;

    // Store regeneration history
    const previousNetSalary = existingPayroll.netSalary;
    const changes = {
      basicSalary: { old: existingPayroll.basicSalary, new: employee.basicSalary },
      netSalary: { old: existingPayroll.netSalary, new: Math.round(netSalary) },
      deductions: { old: existingPayroll.totalDeductions, new: Math.round(totalDeductions) },
      overtime: { old: existingPayroll.overtime.amount, new: Math.round(overtimeAmount) },
    };

    existingPayroll.regenerationHistory.push({
      regeneratedAt: new Date(),
      regeneratedBy: req.user._id,
      reason: reason || 'Payroll regenerated',
      previousNetSalary,
      newNetSalary: Math.round(netSalary),
      changes,
    });

    // Update payroll
    existingPayroll.basicSalary = employee.basicSalary;
    existingPayroll.allowances = {
      houseRent: employee.allowances?.houseRent || 0,
      medical: employee.allowances?.medical || 0,
      transport: employee.allowances?.transport || 0,
    };
    existingPayroll.totalAllowances = totalAllowances;
    existingPayroll.grossSalary = grossSalary;
    existingPayroll.deductions = {
      absent: Math.round(absentDeduction),
      halfDay: Math.round(halfDayDeduction),
      late: Math.round(lateSalaryDeduction),
    };
    existingPayroll.totalDeductions = Math.round(totalDeductions);
    existingPayroll.overtime = {
      hours: Math.round(overtimeHours * 10) / 10,
      amount: Math.round(overtimeAmount),
    };
    existingPayroll.netSalary = Math.round(netSalary);
    existingPayroll.attendance = {
      present: presentDays,
      absent: absentDays,
      leave: leaveDays,
      halfDay: halfDays,
      late: deductibleLates.length,
      lateApproved: approvedLates.length,
    };
    existingPayroll.isRegenerated = true;
    existingPayroll.version += 1;

    await existingPayroll.save();

    const populatedPayroll = await Payroll.findById(existingPayroll._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('regenerationHistory.regeneratedBy', 'name role');

    console.log(`✅ Regenerated payroll for ${employee.firstName} ${employee.lastName} (v${existingPayroll.version})`);

    res.json({
      message: 'Payroll regenerated successfully',
      payroll: populatedPayroll,
    });
  } catch (error) {
    console.error('❌ Error regenerating employee payroll:', error);
    res.status(500).json({ message: error.message });
  }
};


// ✅ NEW: Add manual adjustment to payroll
// @desc    Add adjustment to payroll
// @route   POST /api/payroll/:id/adjustment
// @access  Private/Admin/HR
const addPayrollAdjustment = async (req, res) => {
  try {
    const { amount, description } = req.body;

    if (!amount || amount === 0) {
      return res.status(400).json({ message: 'Adjustment amount is required and cannot be zero' });
    }

    if (!description || description.trim().length < 5) {
      return res.status(400).json({ message: 'Description is required (minimum 5 characters)' });
    }

    const payroll = await Payroll.findById(req.params.id);

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    if (payroll.status === 'Paid') {
      return res.status(400).json({ message: 'Cannot adjust paid payroll' });
    }

    // Add adjustment
    payroll.adjustments.push({
      amount: Number(amount),
      description: description.trim(),
      addedBy: req.user._id,
      addedAt: new Date(),
    });

    // Calculate total adjustments
    payroll.totalAdjustments = payroll.adjustments.reduce((sum, adj) => sum + adj.amount, 0);

    // ✅ Recalculate net salary with adjustments
    const baseNetSalary = payroll.grossSalary - payroll.totalDeductions;
    payroll.netSalary = Math.round(baseNetSalary + payroll.totalAdjustments);

    await payroll.save();

    const populatedPayroll = await Payroll.findById(payroll._id)
      .populate('employee', 'firstName lastName employeeCode')
      .populate('adjustments.addedBy', 'name role');

    console.log(`✅ Adjustment added to payroll: ${amount > 0 ? '+' : ''}৳${amount} - ${description}`);

    res.json({
      message: 'Adjustment added successfully',
      payroll: populatedPayroll,
    });
  } catch (error) {
    console.error('❌ Error adding adjustment:', error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Remove adjustment from payroll
// @desc    Remove adjustment from payroll
// @route   DELETE /api/payroll/:id/adjustment/:adjustmentId
// @access  Private/Admin
const removePayrollAdjustment = async (req, res) => {
  try {
    const { id, adjustmentId } = req.params;

    const payroll = await Payroll.findById(id);

    if (!payroll) {
      return res.status(404).json({ message: 'Payroll not found' });
    }

    if (payroll.status === 'Paid') {
      return res.status(400).json({ message: 'Cannot modify paid payroll' });
    }

    // Find and remove adjustment
    const adjustmentIndex = payroll.adjustments.findIndex(
      adj => adj._id.toString() === adjustmentId
    );

    if (adjustmentIndex === -1) {
      return res.status(404).json({ message: 'Adjustment not found' });
    }

    payroll.adjustments.splice(adjustmentIndex, 1);

    // Recalculate total adjustments
    payroll.totalAdjustments = payroll.adjustments.reduce((sum, adj) => sum + adj.amount, 0);

    // Recalculate net salary
    const baseNetSalary = payroll.grossSalary - payroll.totalDeductions;
    payroll.netSalary = Math.round(baseNetSalary + payroll.totalAdjustments);

    await payroll.save();

    console.log(`✅ Adjustment removed from payroll`);

    res.json({
      message: 'Adjustment removed successfully',
      payroll,
    });
  } catch (error) {
    console.error('❌ Error removing adjustment:', error);
    res.status(500).json({ message: error.message });
  }
};


module.exports = {
  generatePayroll,
  getPayroll,
  getPayrollById,
  updatePayrollStatus,
  deletePayroll,
  regenerateAllPayroll,
  regenerateEmployeePayroll,
  addPayrollAdjustment,
  removePayrollAdjustment,
};