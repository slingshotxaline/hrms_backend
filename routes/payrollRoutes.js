const express = require('express');
const router = express.Router();
const { generatePayroll, getPayroll } = require('../controllers/payrollController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

router.route('/').get(protect, getPayroll);
router.route('/generate').post(protect, hr, generatePayroll);

module.exports = router;
