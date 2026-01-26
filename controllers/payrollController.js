const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');

// @desc    Generate Payroll for a specific month/year
// @route   POST /api/payroll/generate
// @access  Private/Admin/HR
const generatePayroll = async (req, res) => {
  const { month, year, employeeIds } = req.body;

  try {
    let employees;
    if (employeeIds && employeeIds.length > 0) {
      employees = await Employee.find({ _id: { $in: employeeIds } });
    } else {
      employees = await Employee.find({ isActive: true });
    }

    // Get holidays for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    const holidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate },
      isPaid: true // Only count paid holidays
    });

    // Get all dates in the month
    const daysInMonth = endDate.getDate();
    const workingDaysInMonth = getWorkingDays(year, month, holidays);

    const payrolls = [];

    for (const employee of employees) {
      // Get attendance records for the month
      const attendanceRecords = await Attendance.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate }
      });

      // Calculate attendance metrics
      const presentDays = attendanceRecords.filter(a => a.status === 'Present').length;
      const absentDays = attendanceRecords.filter(a => a.status === 'Absent').length;
      const leaveDays = attendanceRecords.filter(a => a.status === 'Leave').length;
      
      // Calculate late deductions
      const totalLateMinutes = attendanceRecords.reduce((sum, a) => sum + (a.lateMinutes || 0), 0);
      const lateDeduction = calculateLateDeduction(totalLateMinutes, employee.basicSalary, workingDaysInMonth);

      // Calculate absent deductions (excluding holidays and weekends)
      const absentDeduction = calculateAbsentDeduction(absentDays, employee.basicSalary, workingDaysInMonth);

      // Basic salary components
      const basic = employee.basicSalary;
      const houseRent = employee.allowances?.houseRent || 0;
      const medical = employee.allowances?.medical || 0;
      const transport = employee.allowances?.transport || 0;
      
      const totalEarnings = basic + houseRent + medical + transport;
      
      // Deductions
      const tax = calculateTax(totalEarnings); // Simple tax calculation
      const pf = calculateProvidentFund(basic); // PF calculation
      
      const totalDeductions = absentDeduction + lateDeduction + tax + pf;
      
      const netSalary = totalEarnings - totalDeductions;

      // Check if payroll already exists
      const existingPayroll = await Payroll.findOne({
        employee: employee._id,
        month,
        year
      });

      if (existingPayroll) {
        // Update existing payroll
        existingPayroll.basicSalary = basic;
        existingPayroll.allowances = { houseRent, medical, transport };
        existingPayroll.deductions = {
          absent: absentDeduction,
          late: lateDeduction,
          tax,
          providentFund: pf
        };
        existingPayroll.totalEarnings = totalEarnings;
        existingPayroll.totalDeductions = totalDeductions;
        existingPayroll.netSalary = netSalary;
        existingPayroll.status = 'Generated';
        
        await existingPayroll.save();
        payrolls.push(existingPayroll);
        continue;
      }

      const payroll = await Payroll.create({
        employee: employee._id,
        month,
        year,
        basicSalary: basic,
        allowances: {
          houseRent,
          medical,
          transport
        },
        deductions: {
          absent: absentDeduction,
          late: lateDeduction,
          tax,
          providentFund: pf
        },
        totalEarnings,
        totalDeductions,
        netSalary,
        status: 'Generated'
      });

      payrolls.push(payroll);
    }

    res.status(201).json({ 
      message: 'Payroll generated successfully', 
      count: payrolls.length, 
      payrolls,
      workingDays: workingDaysInMonth,
      holidays: holidays.length
    });
  } catch (error) {
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