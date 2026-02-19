const express = require('express');
const router = express.Router();
const {
  generatePayroll,
  getPayroll,
  getPayrollById,
  updatePayrollStatus,
  deletePayroll,
  regenerateAllPayroll,
  regenerateEmployeePayroll,
  addPayrollAdjustment, // ✅ NEW
  removePayrollAdjustment, // ✅ NEW
} = require('../controllers/payrollController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

router.post('/generate', protect, hr, generatePayroll);
router.post('/regenerate-all', protect, admin, regenerateAllPayroll);
router.post('/regenerate/:employeeId', protect, hr, regenerateEmployeePayroll);

router.get('/', protect, getPayroll);
router.get('/:id', protect, getPayrollById);

router.put('/:id/status', protect, admin, updatePayrollStatus);
router.delete('/:id', protect, admin, deletePayroll);

// ✅ NEW: Adjustment routes
router.post('/:id/adjustment', protect, hr, addPayrollAdjustment);
router.delete('/:id/adjustment/:adjustmentId', protect, admin, removePayrollAdjustment);

module.exports = router;