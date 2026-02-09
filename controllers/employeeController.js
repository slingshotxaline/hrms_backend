const Employee = require('../models/Employee');
const User = require('../models/User');

// @desc    Create new employee
// @route   POST /api/employees
// @access  Private/Admin/HR
const createEmployee = async (req, res) => {
  try {
    console.log('📝 Creating new employee...');
    console.log('Request body:', req.body);

    const {
      firstName,
      lastName,
      employeeCode,
      biometricId,
      email,
      phone,
      dateOfBirth,
      dateOfJoining,
      department,
      designation,
      basicSalary,
      allowances,
      shiftStart,
      shiftEnd,
      address,
      emergencyContact,
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !employeeCode || !email || !department || !designation) {
      return res.status(400).json({ 
        message: 'Please provide all required fields: firstName, lastName, employeeCode, email, department, designation' 
      });
    }

    // Check if employee code already exists
    const employeeExists = await Employee.findOne({ employeeCode });
    if (employeeExists) {
      return res.status(400).json({ 
        message: `Employee with code ${employeeCode} already exists` 
      });
    }

    // Check if email already exists
    const emailExists = await Employee.findOne({ email });
    if (emailExists) {
      return res.status(400).json({ 
        message: `Employee with email ${email} already exists` 
      });
    }

    // Calculate gross salary
    const totalAllowances = allowances 
      ? (allowances.houseRent || 0) + (allowances.medical || 0) + (allowances.transport || 0)
      : 0;
    const grossSalary = (basicSalary || 0) + totalAllowances;

    // Create employee
    const employee = await Employee.create({
      firstName,
      lastName,
      employeeCode,
      biometricId,
      email,
      phone,
      dateOfBirth: dateOfBirth || new Date(),
      dateOfJoining: dateOfJoining || new Date(),
      department,
      designation,
      basicSalary: basicSalary || 30000,
      grossSalary,
      allowances: allowances || {
        houseRent: 10000,
        medical: 5000,
        transport: 3000,
      },
      shiftStart: shiftStart || '09:00',
      shiftEnd: shiftEnd || '18:00',
      address: address || '',
      emergencyContact: emergencyContact || {
        name: '',
        relationship: '',
        phone: '',
      },
      leaveBalance: {
        casual: 12,
        sick: 10,
        earned: 15,
        unpaid: 0,
      },
    });

    console.log('✅ Employee created:', employee.employeeCode);

    res.status(201).json(employee);
  } catch (error) {
    console.error('❌ Error creating employee:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to create employee',
      error: error.toString()
    });
  }
};

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find({}).sort({ createdAt: -1 });
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
    const employee = await Employee.findById(req.params.id).populate('user', 'name email role');

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    res.json(employee);
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

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if email is being changed and if it already exists
    if (req.body.email && req.body.email !== employee.email) {
      const emailExists = await Employee.findOne({ email: req.body.email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Check if employee code is being changed and if it already exists
    if (req.body.employeeCode && req.body.employeeCode !== employee.employeeCode) {
      const codeExists = await Employee.findOne({ employeeCode: req.body.employeeCode });
      if (codeExists) {
        return res.status(400).json({ message: 'Employee code already in use' });
      }
    }

    // Update fields
    Object.keys(req.body).forEach(key => {
      if (key !== '_id' && req.body[key] !== undefined) {
        employee[key] = req.body[key];
      }
    });

    // Recalculate gross salary if basic salary or allowances changed
    if (req.body.basicSalary || req.body.allowances) {
      const totalAllowances = employee.allowances 
        ? (employee.allowances.houseRent || 0) + (employee.allowances.medical || 0) + (employee.allowances.transport || 0)
        : 0;
      employee.grossSalary = employee.basicSalary + totalAllowances;
    }

    await employee.save();

    res.json(employee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private/Admin
const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Check if employee has a linked user account
    if (employee.user) {
      // Optionally delete the user account or just unlink it
      await User.findByIdAndUpdate(employee.user, { 
        employeeId: null,
        isActive: false 
      });
    }

    await employee.deleteOne();

    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle employee active status
// @route   PUT /api/employees/:id/toggle-status
// @access  Private/Admin
const toggleEmployeeStatus = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Toggle the status
    employee.isActive = !employee.isActive;
    await employee.save(); // This will trigger the pre-save hook to sync with User

    console.log(`✅ Employee ${employee.firstName} ${employee.lastName} is now ${employee.isActive ? 'ACTIVE' : 'INACTIVE'}`);

    res.json({ 
      message: `Employee ${employee.isActive ? 'activated' : 'deactivated'} successfully`,
      employee 
    });
  } catch (error) {
    console.error('Error toggling employee status:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  toggleEmployeeStatus,
};