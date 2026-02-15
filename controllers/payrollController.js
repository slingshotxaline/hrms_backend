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
    const { month, year } = req.body;

    console.log(`💰 Generating payroll for ${month}/${year}`);

    // Date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const daysInMonth = endDate.getDate();

    console.log(`📅 Processing ${daysInMonth} days from ${startDate.toDateString()} to ${endDate.toDateString()}`);

    // Get all active employees
    const employees = await Employee.find({ isActive: true });
    console.log(`👥 Found ${employees.length} active employees`);

    // ✅ Get late settings
    const lateSettings = await LateSettings.findOne({ organization: 'default' });
    const graceDaysPerMonth = lateSettings?.graceDaysPerMonth || 2;
    const deductionPreference = lateSettings?.deductionPreference || 'Leave';

    const payrollRecords = [];

    for (const employee of employees) {
      console.log(`\n📊 Processing payroll for ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`);

      // Get attendance records for the month
      const attendanceRecords = await Attendance.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
      });

      // Count attendance
      const presentDays = attendanceRecords.filter(a => a.status === 'Present').length;
      const absentDays = attendanceRecords.filter(a => a.status === 'Absent').length;
      const leaveDays = attendanceRecords.filter(a => a.status === 'Leave').length;
      const halfDays = attendanceRecords.filter(a => a.isHalfDay).length;

      // Calculate total working days (excluding weekends and holidays)
      const totalWorkingDays = daysInMonth; // Simplified - you can improve this

      console.log(`   Present: ${presentDays}, Absent: ${absentDays}, Leave: ${leaveDays}, Half Days: ${halfDays}`);

      // Calculate overtime
      const totalOvertimeMinutes = attendanceRecords.reduce((sum, a) => sum + (a.overtimeMinutes || 0), 0);
      const overtimeHours = totalOvertimeMinutes / 60;
      const overtimeAmount = (employee.basicSalary / 30 / 8) * overtimeHours * 1.5; // 1.5x rate

      // ✅ Calculate late deductions
      const lates = await Late.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
        status: { $ne: 'Rejected' } // Don't count rejected lates
      }).sort({ date: 1 });

      // Separate approved and unapproved lates
      const approvedLates = lates.filter(l => l.status === 'Approved');
      const unapprovedLates = lates.filter(l => l.status === 'Pending');

      // Only unapproved lates count for deduction (approved ones are forgiven)
      const deductibleLates = unapprovedLates.filter((_, index) => index >= graceDaysPerMonth);

      let lateSalaryDeduction = 0;
      let lateLeaveDeduction = 0;
      let availableEarnedLeave = employee.leaveBalance.earned || 0;
      const perDaySalary = employee.basicSalary / 30;

      console.log(`   🕐 Total lates: ${lates.length}, Approved: ${approvedLates.length}, Deductible: ${deductibleLates.length}`);

      // Process each deductible late
      for (let i = 0; i < deductibleLates.length; i++) {
        const late = deductibleLates[i];
        
        if (deductionPreference === 'Salary') {
          // Always deduct salary
          lateSalaryDeduction += perDaySalary;
          
          // Mark late as deducted
          late.isDeducted = true;
          late.deductionType = 'Salary';
          late.deductionAmount = perDaySalary;
          await late.save();
        } else if (deductionPreference === 'Leave') {
          // Deduct leave if available, otherwise salary
          if (availableEarnedLeave > 0) {
            lateLeaveDeduction += 1;
            availableEarnedLeave -= 1;
            
            // Mark late as deducted
            late.isDeducted = true;
            late.deductionType = 'Leave';
            late.deductionAmount = 1;
            await late.save();
          } else {
            lateSalaryDeduction += perDaySalary;
            
            // Mark late as deducted
            late.isDeducted = true;
            late.deductionType = 'Salary';
            late.deductionAmount = perDaySalary;
            await late.save();
          }
        }
      }

      // Update employee leave balance if leaves were deducted for lates
      if (lateLeaveDeduction > 0) {
        employee.leaveBalance.earned -= lateLeaveDeduction;
        await employee.save();
        console.log(`   ✅ Deducted ${lateLeaveDeduction} earned leave(s) for late arrivals`);
      }

      console.log(`   💸 Late deductions: Salary: ৳${Math.round(lateSalaryDeduction)}, Leave: ${lateLeaveDeduction} days`);

      // Calculate deductions
      const absentDeduction = (employee.basicSalary / totalWorkingDays) * absentDays;
      const halfDayDeduction = (employee.basicSalary / totalWorkingDays) * halfDays * 0.5;

      // Calculate total allowances
      const totalAllowances = 
        (employee.allowances?.houseRent || 0) + 
        (employee.allowances?.medical || 0) + 
        (employee.allowances?.transport || 0);

      // Calculate gross salary
      const grossSalary = employee.basicSalary + totalAllowances;

      // Calculate total deductions
      const totalDeductions = absentDeduction + halfDayDeduction + lateSalaryDeduction;

      // Calculate net salary
      const netSalary = grossSalary + overtimeAmount - totalDeductions;

      console.log(`   💰 Gross: ৳${grossSalary}, Deductions: ৳${Math.round(totalDeductions)}, Net: ৳${Math.round(netSalary)}`);

      // Create payroll record
      const payroll = {
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
          halfDay: Math.round(halfDayDeduction),
          late: Math.round(lateSalaryDeduction), // ✅ ADD THIS
        },
        totalDeductions: Math.round(totalDeductions),
        overtime: {
          hours: Math.round(overtimeHours * 10) / 10,
          amount: Math.round(overtimeAmount),
        },
        netSalary: Math.round(netSalary),
        attendance: {
          present: presentDays,
          absent: absentDays,
          leave: leaveDays,
          halfDay: halfDays,
          late: deductibleLates.length, // ✅ ADD THIS
          lateApproved: approvedLates.length, // ✅ ADD THIS
        },
        status: 'Pending',
      };

      payrollRecords.push(payroll);
    }

    // Save all payroll records
    const savedPayrolls = await Payroll.insertMany(payrollRecords);

    console.log(`\n✅ Generated ${savedPayrolls.length} payroll records`);

    res.status(201).json({
      message: 'Payroll generated successfully',
      count: savedPayrolls.length,
      payrolls: savedPayrolls,
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
    const { month, year, employeeId } = req.query;
    const query = {};

    if (month) query.month = month;
    if (year) query.year = year;
    if (employeeId) query.employee = employeeId;

    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName employeeCode department designation')
      .sort({ year: -1, month: -1 });
    
    res.json(payrolls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { generatePayroll, getPayroll };