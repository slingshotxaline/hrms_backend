const User = require("../models/User");
const generateToken = require("../utils/generateToken");

// Secret keys for admin/hr registration (store in .env in production)
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "HRMS_ADMIN_2024";
const HR_SECRET = process.env.HR_SECRET_KEY || "HRMS_HR_2024";

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  console.log("=== LOGIN REQUEST ===");
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email }).populate("employeeId");

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
      res.status(401).json({ message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public (with secret key for Admin/HR) or Protected (for employees)
const registerUser = async (req, res) => {
  console.log("=== REGISTER REQUEST ===");

  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({
      message: "Request body is empty or undefined",
    });
  }

  const { name, email, password, role, employeeId, secretKey } = req.body;

  try {
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // If role is Admin or HR, validate secret key (for public registration)
    if ((role === "Admin" || role === "HR") && !req.user) {
      const validSecretKey = role === "Admin" ? ADMIN_SECRET : HR_SECRET;

      if (!secretKey || secretKey !== validSecretKey) {
        return res.status(403).json({
          message: "Invalid secret key. Unauthorized registration attempt.",
        });
      }
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
      role: role || "Employee",
      employeeId,
    });

    if (user) {
      // If employeeId is provided, update the employee record
      if (employeeId) {
        const Employee = require("../models/Employee");
        await Employee.findByIdAndUpdate(employeeId, { user: user._id });
      }

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        token: generateToken(user._id),
        message: "User registered successfully",
      });
    } else {
      res.status(400).json({ message: "Invalid user data" });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id).populate("employeeId");

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
    });
  } else {
    res.status(404).json({ message: "User not found" });
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
      return res.status(404).json({ message: "User not found" });
    }

    if (email && email !== user.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        return res.status(400).json({ message: "Email already in use" });
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
    const user = await User.findById(req.user._id).select("+password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });
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
      return res
        .status(400)
        .json({ message: "User ID and new password are required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  loginUser,
  registerUser,
  getUserProfile,
  updateProfile,
  updatePassword,
  resetPassword,
};
