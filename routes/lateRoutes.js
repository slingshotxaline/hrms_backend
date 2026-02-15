const express = require('express');
const router = express.Router();
const {
  applyLate,
  getLates,
  getLateById,
  updateLateStatus,
  deleteLate,
  getLateSettings,
  updateLateSettings,
  calculateLateDeductions,
  getLateDeductionReport,
} = require('../controllers/lateController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

// Late applications
router.post('/', protect, applyLate);
router.get('/', protect, getLates);
router.get('/:id', protect, getLateById);
router.put('/:id', protect, updateLateStatus);
router.delete('/:id', protect, deleteLate);

// Settings
router.get('/settings/config', protect, admin, getLateSettings);
router.put('/settings/config', protect, admin, updateLateSettings);

// Deduction calculation
router.get('/calculate-deductions/:employeeId/:month', protect, hr, calculateLateDeductions);
router.get('/report/:month', protect, hr, getLateDeductionReport);

module.exports = router;