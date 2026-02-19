const express = require('express');
const router = express.Router();
const {
  applyLeave,
  getLeaves,
  getLeaveById,
  updateLeaveStatus,
  deleteLeave,
  getPendingApprovals,
  getMonthlyLeaveUsage,
} = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getLeaves)
  .post(protect, applyLeave);

router.get('/pending-approvals', protect, getPendingApprovals);

// ✅ FIX: Create two separate routes instead of optional parameter
router.get('/monthly-usage', protect, getMonthlyLeaveUsage); // For own usage
router.get('/monthly-usage/:employeeId', protect, getMonthlyLeaveUsage); // For specific employee

router.route('/:id')
  .get(protect, getLeaveById)
  .put(protect, updateLeaveStatus)
  .delete(protect, deleteLeave);

module.exports = router; 