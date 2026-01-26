const express = require('express');
const router = express.Router();
const {
  loginUser,
  registerUser,
  getUserProfile,
} = require('../controllers/authController');
const { protect, hr } = require('../middleware/authMiddleware');

// Public routes
router.post('/login', loginUser);
router.post('/register', registerUser); // Public but with secret key validation

// Protected routes
router.post('/register-employee', protect, hr, registerUser); // For creating employee accounts
router.get('/profile', protect, getUserProfile);

module.exports = router;