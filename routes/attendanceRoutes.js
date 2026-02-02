const express = require('express');
const router = express.Router();
const { 
  markAttendance, 
  getAttendance, 
  getAttendanceById,
  manualAttendance 
} = require('../controllers/attendanceController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

router.post('/mark', markAttendance); // Public or API Key protected
router.get('/', protect, getAttendance);
router.get('/:id', protect, getAttendanceById); // ✅ New route for punch details
router.put('/:id', protect, hr, manualAttendance);

module.exports = router;