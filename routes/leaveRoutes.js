const express = require('express');
const router = express.Router();
const {
  applyLeave,
  getLeaves,
  getLeaveById,
  updateLeaveStatus,
  deleteLeave,
  getPendingApprovals,
} = require('../controllers/leaveController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getLeaves)
  .post(protect, applyLeave);

// ✅ New route for pending approvals
router.get('/pending-approvals', protect, getPendingApprovals);

router.route('/:id')
  .get(protect, getLeaveById)
  .put(protect, updateLeaveStatus)
  .delete(protect, deleteLeave);

module.exports = router;