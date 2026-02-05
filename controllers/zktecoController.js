const zktecoService = require('../services/zktecoService');

// @desc    Add ZKTeco device
// @route   POST /api/zkteco/devices
// @access  Private/Admin
const addDevice = async (req, res) => {
  try {
    const { ip, port, name, timeout } = req.body;

    if (!ip) {
      return res.status(400).json({ message: 'Device IP is required' });
    }

    const device = zktecoService.addDevice({
      ip,
      port: port || 4370,
      name: name || ip,
      timeout: timeout || 5000,
    });

    res.status(201).json({
      message: 'Device added successfully',
      device: {
        ip: device.config.ip,
        port: device.config.port,
        name: device.config.name,
      },
    });
  } catch (error) {
    console.error('Error adding device:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Connect to devices
// @route   POST /api/zkteco/connect
// @access  Private/Admin
const connectDevices = async (req, res) => {
  try {
    const success = await zktecoService.connectAllDevices();
    
    if (success) {
      res.json({ message: 'Connected to devices successfully' });
    } else {
      res.status(500).json({ message: 'Failed to connect to any devices' });
    }
  } catch (error) {
    console.error('Error connecting to devices:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Sync attendance from devices
// @route   POST /api/zkteco/sync
// @access  Private/Admin/HR
const syncAttendance = async (req, res) => {
  try {
    console.log(`🔄 Manual sync triggered by ${req.user.name}`);
    
    const results = await zktecoService.syncAllDevices();
    
    res.json({
      message: 'Sync completed',
      results,
    });
  } catch (error) {
    console.error('Error syncing attendance:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get device users
// @route   GET /api/zkteco/users
// @access  Private/Admin/HR
const getDeviceUsers = async (req, res) => {
  try {
    const { deviceIndex } = req.query;
    
    if (zktecoService.devices.length === 0) {
      return res.status(400).json({ message: 'No devices configured' });
    }

    const device = zktecoService.devices[deviceIndex || 0];
    const users = await zktecoService.getUsers(device);
    
    res.json({ users });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get device info
// @route   GET /api/zkteco/device-info
// @access  Private/Admin
const getDeviceInfo = async (req, res) => {
  try {
    const { deviceIndex } = req.query;
    
    if (zktecoService.devices.length === 0) {
      return res.status(400).json({ message: 'No devices configured' });
    }

    const device = zktecoService.devices[deviceIndex || 0];
    const info = await zktecoService.getDeviceInfo(device);
    
    res.json({ info });
  } catch (error) {
    console.error('Error getting device info:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Clear device logs
// @route   POST /api/zkteco/clear-logs
// @access  Private/Admin
const clearDeviceLogs = async (req, res) => {
  try {
    const { deviceIndex } = req.body;
    
    if (zktecoService.devices.length === 0) {
      return res.status(400).json({ message: 'No devices configured' });
    }

    const device = zktecoService.devices[deviceIndex || 0];
    await zktecoService.clearAttendanceLogs(device);
    
    res.json({ message: 'Device logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Disconnect from devices
// @route   POST /api/zkteco/disconnect
// @access  Private/Admin
const disconnectDevices = async (req, res) => {
  try {
    await zktecoService.disconnectAll();
    res.json({ message: 'Disconnected from all devices' });
  } catch (error) {
    console.error('Error disconnecting:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  addDevice,
  connectDevices,
  syncAttendance,
  getDeviceUsers,
  getDeviceInfo,
  clearDeviceLogs,
  disconnectDevices,
};