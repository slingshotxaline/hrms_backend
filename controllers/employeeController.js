const Employee = require('../models/Employee');
const User = require('../models/User');

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private/Admin/HR
const createEmployee = async (req, res) => {
  try {
    const {
      employeeCode,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      dateOfJoining,
      department,
      designation,
      salary,
      bankAccount,
      address,
      emergencyContact,
      allowances,
      shiftStart,
      shiftEnd,
    } = req.body;

    // Check if employee code or email already exists
    const employeeExists = await Employee.findOne({
      $or: [{ employeeCode }, { email }],
    });

    if (employeeExists) {
      return res.status(400).json({
        message: 'Employee with this code or email already exists',
      });
    }

    // ✅ Create employee with default leave balance
    const employee = await Employee.create({
      employeeCode,
      firstName,
      lastName,
      email,
      phone,
      dateOfBirth,
      dateOfJoining,
      department,
      designation,
      salary,
      bankAccount,
      address,
      emergencyContact,
      allowances,
      shiftStart: shiftStart || '09:00',
      shiftEnd: shiftEnd || '18:00',
      // ✅ Ensure leave balance is initialized
      leaveBalance: {
        casual: 12,
        sick: 12,
        earned: 15,
        unpaid: 0,
      },
    });

    console.log(`✅ Created employee: ${employee.firstName} ${employee.lastName} with leave balance initialized`);

    res.status(201).json(employee);
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private/Admin/HR
const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({});
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get employee by ID
// @route   GET /api/employees/:id
// @access  Private
const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (employee) {
      res.json(employee);
    } else {
      res.status(404).json({ message: 'Employee not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private/Admin/HR
const updateEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (employee) {
      employee.firstName = req.body.firstName || employee.firstName;
      employee.lastName = req.body.lastName || employee.lastName;
      employee.department = req.body.department || employee.department;
      employee.designation = req.body.designation || employee.designation;
      employee.basicSalary = req.body.basicSalary || employee.basicSalary;
      employee.shiftStart = req.body.shiftStart || employee.shiftStart;
      employee.shiftEnd = req.body.shiftEnd || employee.shiftEnd;
      
      if(req.body.allowances) {
          employee.allowances = { ...employee.allowances, ...req.body.allowances };
      }

      const updatedEmployee = await employee.save();
      res.json(updatedEmployee);
    } else {
      res.status(404).json({ message: 'Employee not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
};
