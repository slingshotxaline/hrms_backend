const express = require('express');
const router = express.Router();
const { applyLeave, getLeaves, updateLeaveStatus } = require('../controllers/leaveController');
const { protect, hr } = require('../middleware/authMiddleware');

router.route('/').get(protect, getLeaves).post(protect, applyLeave);
router.route('/:id').put(protect, hr, updateLeaveStatus);

module.exports = router;
