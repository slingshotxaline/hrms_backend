const Employee = require('../models/Employee');
const User = require('../models/User');

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private/Admin/HR
const createEmployee = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      employeeCode,
      department,
      designation,
      joiningDate,
      basicSalary,
      allowances,
      shiftStart,
      shiftEnd,
      email, // Optional: if linking to a user immediately or creating a user
    } = req.body;

    const employeeExists = await Employee.findOne({ employeeCode });

    if (employeeExists) {
      return res.status(400).json({ message: 'Employee with this code already exists' });
    }

    const employee = await Employee.create({
      firstName,
      lastName,
      employeeCode,
      department,
      designation,
      joiningDate,
      basicSalary,
      allowances,
      shiftStart,
      shiftEnd,
    });

    res.status(201).json(employee);
  } catch (error) {
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
