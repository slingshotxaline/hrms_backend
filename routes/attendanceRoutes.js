const express = require('express');
const router = express.Router();
const { markAttendance, getAttendance, manualAttendance } = require('../controllers/attendanceController');
const { protect, hr } = require('../middleware/authMiddleware');

router.route('/').get(protect, getAttendance);
router.route('/mark').post(markAttendance); // Public for device/mock
router.route('/:id').put(protect, hr, manualAttendance);

module.exports = router;
