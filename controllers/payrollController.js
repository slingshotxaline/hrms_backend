const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');

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

    const payrolls = [];

    for (const employee of employees) {
      // Basic Calculation Logic
      const basic = employee.basicSalary;
      const houseRent = employee.allowances.houseRent || 0;
      const medical = employee.allowances.medical || 0;
      const transport = employee.allowances.transport || 0;
      
      const totalEarnings = basic + houseRent + medical + transport;
      
      // TODO: Calculate deductions based on attendance (Absent days)
      const absentDeduction = 0; // Placeholder
      const tax = 0; // Placeholder
      const pf = 0; // Placeholder
      
      const totalDeductions = absentDeduction + tax + pf;
      
      const netSalary = totalEarnings - totalDeductions;

      // Check if payroll already exists
      const existingPayroll = await Payroll.findOne({
          employee: employee._id,
          month,
          year
      });

      if (existingPayroll) {
          // Update or Skip? Let's skip or update logic here
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
            tax,
            providentFund: pf
        },
        totalEarnings,
        totalDeductions,
        netSalary,
        status: 'Draft'
      });

      payrolls.push(payroll);
    }

    res.status(201).json({ message: 'Payroll generated successfully', count: payrolls.length, payrolls });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

        const payrolls = await Payroll.find(query).populate('employee', 'firstName lastName employeeCode');
        res.json(payrolls);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { generatePayroll, getPayroll };
