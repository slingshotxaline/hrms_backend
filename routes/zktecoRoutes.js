const express = require('express');
const router = express.Router();
const {
  addDevice,
  connectDevices,
  syncAttendance,
  getDeviceUsers,
  getDeviceInfo,
  clearDeviceLogs,
  disconnectDevices,
} = require('../controllers/zktecoController');
const { protect, admin, hr } = require('../middleware/authMiddleware');

// Admin only routes
router.post('/devices', protect, admin, addDevice);
router.post('/connect', protect, admin, connectDevices);
router.post('/disconnect', protect, admin, disconnectDevices);
router.post('/clear-logs', protect, admin, clearDeviceLogs);
router.get('/device-info', protect, admin, getDeviceInfo);

// Admin/HR routes
router.post('/sync', protect, hr, syncAttendance);
router.get('/users', protect, hr, getDeviceUsers);

module.exports = router;