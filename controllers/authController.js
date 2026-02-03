const User = require('../models/User');
const Employee = require('../models/Employee');
const generateToken = require('../utils/generateToken');

// Secret keys for admin/hr registration
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'HRMS_ADMIN_2024';
const HR_SECRET = process.env.HR_SECRET_KEY || 'HRMS_HR_2024';

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  console.log('=== LOGIN REQUEST ===');
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).populate('employeeId');

    if (user && (await user.matchPassword(password))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user (Creates both User and Employee record)
// @route   POST /api/auth/register
// @access  Public (with secret key for Admin/HR)
const registerUser = async (req, res) => {
  console.log('=== REGISTER REQUEST ===');
  
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ 
      message: 'Request body is empty or undefined'
    });
  }

  const { name, email, password, role, employeeId, secretKey, employeeData } = req.body;

  try {
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // If role is Admin or HR and no employeeId provided, validate secret key
    if ((role === 'Admin' || role === 'HR') && !req.user && !employeeId) {
      const validSecretKey = role === 'Admin' ? ADMIN_SECRET : HR_SECRET;
      
      if (!secretKey || secretKey !== validSecretKey) {
        return res.status(403).json({ 
          message: 'Invalid secret key. Unauthorized registration attempt.' 
        });
      }

      // Create employee record for Admin/HR during registration
      if (employeeData) {
        const newEmployee = await Employee.create({
          firstName: employeeData.firstName || name.split(' ')[0],
          lastName: employeeData.lastName || name.split(' ')[1] || '',
          employeeCode: employeeData.employeeCode,
          department: employeeData.department || (role === 'Admin' ? 'Administration' : 'Human Resources'),
          designation: employeeData.designation || (role === 'Admin' ? 'System Administrator' : 'HR Manager'),
          joiningDate: employeeData.joiningDate || new Date(),
          basicSalary: employeeData.basicSalary || 50000,
          allowances: employeeData.allowances || {
            houseRent: 10000,
            medical: 5000,
            transport: 3000
          },
          shiftStart: employeeData.shiftStart || '09:00',
          shiftEnd: employeeData.shiftEnd || '18:00',
        });

        // Create user with employee reference
        const user = await User.create({
          name,
          email,
          password,
          role: role || 'Employee',
          employeeId: newEmployee._id,
        });

        // Link user to employee
        newEmployee.user = user._id;
        await newEmployee.save();

        return res.status(201).json({
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: newEmployee._id,
          token: generateToken(user._id),
          message: 'User and employee record created successfully'
        });
      }
    }

    // Create user (for employees created by HR/Admin)
    const user = await User.create({
      name,
      email,
      password,
      role: role || 'Employee',
      employeeId,
    });

    if (user) {
      // If employeeId is provided, update the employee record
      if (employeeId) {
        await Employee.findByIdAndUpdate(employeeId, { user: user._id });
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        employeeId: user.employeeId,
        token: generateToken(user._id),
        message: 'User registered successfully'
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile (OLD - keeping for compatibility)
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate({
        path: 'employeeId',
        select: 'firstName lastName employeeCode department designation email phone'
      })
      .populate({
        path: 'reportsTo',
        select: 'name role' // ✅ Get manager name and role
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      reportsTo: user.reportsTo, // ✅ Manager info
      manages: user.manages,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      user.email = email;
    }

    if (name) user.name = name;

    await user.save({ validateBeforeSave: false });

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update own password
// @route   PUT /api/auth/password
// @access  Private
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Admin resets any user's password
// @route   POST /api/auth/reset-password
// @access  Private/Admin
const resetPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ message: 'User ID and new password are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile (NEW - with full details)
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate({
        path: 'employeeId',
        select: 'firstName lastName employeeCode department designation email phone'
      })
      .populate({
        path: 'reportsTo',
        select: 'name role' // ✅ Get manager name and role
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      reportsTo: user.reportsTo, // ✅ Manager info
      manages: user.manages,
      isActive: user.isActive,
    });
  } catch (error) {
    console.error('Error getting profile:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { 
  loginUser, 
  registerUser, 
  getUserProfile,
  getProfile, 
  updateProfile, 
  updatePassword, 
  resetPassword 
};