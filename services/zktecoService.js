const ZKLib = require("node-zklib");
const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");

class ZKTecoService {
  constructor() {
    this.devices = [];
    this.isConnected = false;
  }

  /**
   * Add a ZKTeco device
   * @param {Object} config - Device configuration
   * @param {string} config.ip - Device IP address
   * @param {number} config.port - Device port (default 4370)
   * @param {number} config.timeout - Connection timeout
   * @param {string} config.name - Device name/location
   */
  addDevice(config) {
    const device = {
      config,
      zkInstance: null,
      isConnected: false,
    };
    this.devices.push(device);
    console.log(`✅ Added ZKTeco device: ${config.name || config.ip}`);
    return device;
  }

  /**
   * Connect to a specific device
   */
  async connectDevice(device) {
    try {
      console.log(`🔌 Connecting to ZKTeco device at ${device.config.ip}...`);

      const zkInstance = new ZKLib({
        ip: device.config.ip,
        port: device.config.port || 4370,
        timeout: device.config.timeout || 5000,
        inport: 5200,
      });

      await zkInstance.connect();
      device.zkInstance = zkInstance;
      device.isConnected = true;

      console.log(
        `✅ Connected to ZKTeco device: ${device.config.name || device.config.ip}`,
      );
      return true;
    } catch (error) {
      console.error(
        `❌ Failed to connect to device ${device.config.ip}:`,
        error.message,
      );
      device.isConnected = false;
      return false;
    }
  }

  /**
   * Connect to all configured devices
   */
  async connectAllDevices() {
    console.log(`🔌 Connecting to ${this.devices.length} ZKTeco devices...`);

    const results = await Promise.all(
      this.devices.map((device) => this.connectDevice(device)),
    );

    const connectedCount = results.filter((r) => r).length;
    console.log(
      `✅ Connected to ${connectedCount}/${this.devices.length} devices`,
    );

    return connectedCount > 0;
  }

  /**
   * Disconnect from a device
   */
  async disconnectDevice(device) {
    try {
      if (device.zkInstance && device.isConnected) {
        await device.zkInstance.disconnect();
        device.isConnected = false;
        console.log(
          `🔌 Disconnected from device: ${device.config.name || device.config.ip}`,
        );
      }
    } catch (error) {
      console.error(`❌ Error disconnecting from device:`, error.message);
    }
  }

  /**
   * Get attendance logs from device
   */
  async getAttendanceLogs(device, startDate = null, endDate = null) {
    try {
      if (!device.isConnected) {
        await this.connectDevice(device);
      }

      console.log(
        `📊 Fetching attendance logs from ${device.config.name || device.config.ip}...`,
      );

      const logs = await device.zkInstance.getAttendances();
      console.log(`✅ Retrieved ${logs.data.length} attendance records`);

      // Filter by date if provided
      let filteredLogs = logs.data;
      if (startDate || endDate) {
        filteredLogs = logs.data.filter((log) => {
          const logDate = new Date(log.timestamp);
          if (startDate && logDate < new Date(startDate)) return false;
          if (endDate && logDate > new Date(endDate)) return false;
          return true;
        });
      }

      return filteredLogs;
    } catch (error) {
      console.error(`❌ Error fetching attendance logs:`, error.message);
      throw error;
    }
  }

/**
 * Process and save attendance logs to database
 */
async processAttendanceLogs(logs, deviceId = null) {
  console.log(`📝 Processing ${logs.length} attendance records...`);
  
  let processed = 0;
  let errors = 0;

  for (const log of logs) {
    try {
      // Find employee by device user ID
      const employee = await Employee.findOne({ 
        $or: [
          { employeeCode: log.deviceUserId },
          { biometricId: log.deviceUserId }
        ]
      });

      if (!employee) {
        console.log(`⚠️ Employee not found for device user ID: ${log.deviceUserId}`);
        errors++;
        continue;
      }

      // ✅ Determine punch type (IN or OUT) based on last punch
      const punchType = await this.determinePunchType(log, employee);

      // Convert timestamp to Bangladesh timezone
      const bangladeshTime = new Date(log.timestamp.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
      const attendanceDate = new Date(bangladeshTime);
      attendanceDate.setHours(0, 0, 0, 0);

      // Find or create attendance record for the day
      let attendance = await Attendance.findOne({
        employee: employee._id,
        date: attendanceDate,
      });

      if (!attendance) {
        attendance = new Attendance({
          employee: employee._id,
          date: attendanceDate,
          punches: [],
        });
      }

      // Check if this punch already exists (avoid duplicates)
      const existingPunch = attendance.punches.find(p => {
        const timeDiff = Math.abs(new Date(p.timestamp) - bangladeshTime);
        return timeDiff < 60000; // Within 1 minute
      });

      if (!existingPunch) {
        // Add new punch
        attendance.punches.push({
          timestamp: bangladeshTime,
          type: punchType,
          location: deviceId || 'Main Office',
          deviceId: `ZKTeco-${log.deviceUserId}`,
        });

        // Sort punches by timestamp
        attendance.punches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Update inTime (first IN punch)
        const firstInPunch = attendance.punches.find(p => p.type === 'IN');
        if (firstInPunch) {
          attendance.inTime = firstInPunch.timestamp;
        }

        // Update outTime (last OUT punch)
        const lastOutPunch = [...attendance.punches].reverse().find(p => p.type === 'OUT');
        if (lastOutPunch) {
          attendance.outTime = lastOutPunch.timestamp;
        }

        // ✅ Calculate timing status, breaks, overtime using existing logic
        await this.calculateAttendanceMetrics(attendance, employee);

        await attendance.save();
        processed++;
        
        console.log(`✅ Processed: ${employee.firstName} ${employee.lastName} - ${punchType} at ${bangladeshTime.toLocaleTimeString()}`);
      } else {
        console.log(`⏭️ Skipped duplicate punch for ${employee.firstName} ${employee.lastName}`);
      }

    } catch (error) {
      console.error(`❌ Error processing log:`, error.message);
      errors++;
    }
  }

  console.log(`\n📊 Processing Summary:`);
  console.log(`   ✅ Processed: ${processed}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`   ⏭️ Skipped: ${logs.length - processed - errors}`);

  return { processed, errors };
}

  /**
   * Determine punch type (IN or OUT) based on employee's last punch
   */
  async determinePunchType(log, employee) {
    try {
      // Get today's attendance for this employee
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const attendance = await Attendance.findOne({
        employee: employee._id,
        date: today,
      });

      // If no attendance record or no punches yet, it's IN
      if (!attendance || attendance.punches.length === 0) {
        return "IN";
      }

      // Get the last punch
      const lastPunch = attendance.punches[attendance.punches.length - 1];

      // Alternate: if last was IN, this is OUT; if last was OUT, this is IN
      return lastPunch.type === "IN" ? "OUT" : "IN";
    } catch (error) {
      console.error("Error determining punch type:", error);
      // Default to IN on error
      return "IN";
    }
  }

  /**
   * Calculate attendance metrics (timing, breaks, overtime)
   */
  async calculateAttendanceMetrics(attendance, employee) {
    if (attendance.punches.length === 0) return;

    // Helper functions
    const parseShiftTime = (timeString) => {
      const [hours, minutes] = timeString.split(":").map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return date;
    };

    const getMinutesDifference = (time1, time2) => {
      return Math.floor((time1 - time2) / (1000 * 60));
    };

    const calculateWorkingTime = (punches) => {
      if (punches.length < 2) {
        return { totalBreakMinutes: 0, netWorkingMinutes: 0 };
      }

      let totalBreakMinutes = 0;
      let lastOutTime = null;

      const sortedPunches = [...punches].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp),
      );

      for (let i = 0; i < sortedPunches.length; i++) {
        const punch = sortedPunches[i];

        if (punch.type === "OUT") {
          lastOutTime = new Date(punch.timestamp);
        } else if (punch.type === "IN" && lastOutTime) {
          const breakMinutes = getMinutesDifference(
            new Date(punch.timestamp),
            lastOutTime,
          );
          if (breakMinutes > 0) {
            totalBreakMinutes += breakMinutes;
          }
          lastOutTime = null;
        }
      }

      const firstIn = sortedPunches.find((p) => p.type === "IN");
      const lastOut = [...sortedPunches]
        .reverse()
        .find((p) => p.type === "OUT");

      let netWorkingMinutes = 0;
      if (firstIn && lastOut) {
        const totalMinutes = getMinutesDifference(
          new Date(lastOut.timestamp),
          new Date(firstIn.timestamp),
        );
        netWorkingMinutes = totalMinutes - totalBreakMinutes;
      }

      return { totalBreakMinutes, netWorkingMinutes };
    };

    // ✅ Calculate shift-based timing for first IN punch
    const firstInPunch = attendance.punches.find((p) => p.type === "IN");
    if (firstInPunch) {
      const bangladeshPunchTime = new Date(
        firstInPunch.timestamp.toLocaleString("en-US", {
          timeZone: "Asia/Dhaka",
        }),
      );

      const shiftDate = new Date(bangladeshPunchTime);
      const [shiftHour, shiftMin] = (employee.shiftStart || "09:00")
        .split(":")
        .map(Number);
      shiftDate.setHours(shiftHour, shiftMin, 0, 0);
      const shiftStartTime = shiftDate;

      const gracePeriodEnd = new Date(shiftStartTime.getTime() + 30 * 60000);

      const [halfDayHour] = "12:00".split(":").map(Number);
      const halfDayDate = new Date(bangladeshPunchTime);
      halfDayDate.setHours(halfDayHour, 0, 0, 0);
      const halfDayTime = halfDayDate;

      const inTime = new Date(firstInPunch.timestamp);
      const minutesBeforeShift = getMinutesDifference(shiftStartTime, inTime);
      const minutesAfterShift = getMinutesDifference(inTime, shiftStartTime);

      // Same logic as your existing system
      if (inTime < shiftStartTime) {
        attendance.status = "Present";
        attendance.lateMinutes = 0;
        attendance.isEarly = true;
        attendance.earlyMinutes = minutesBeforeShift;
        attendance.timingStatus = "Early";
      } else if (inTime <= gracePeriodEnd) {
        attendance.status = "Present";
        attendance.lateMinutes = minutesAfterShift;
        attendance.usedGracePeriod = minutesAfterShift > 0;
        attendance.timingStatus =
          minutesAfterShift === 0 ? "On Time" : "On Time (Grace)";
      } else if (inTime > gracePeriodEnd && inTime < halfDayTime) {
        attendance.status = "Present";
        attendance.lateMinutes = minutesAfterShift;
        attendance.timingStatus = "Late";
      } else if (inTime >= halfDayTime) {
        attendance.status = "Present";
        attendance.lateMinutes = minutesAfterShift;
        attendance.isHalfDay = true;
        attendance.timingStatus = "Half Day";
      }
    }

    // ✅ Calculate OUT time status (only based on last OUT punch)
    const lastOutPunch = [...attendance.punches]
      .reverse()
      .find((p) => p.type === "OUT");
    if (lastOutPunch) {
      const bangladeshPunchTime = new Date(
        lastOutPunch.timestamp.toLocaleString("en-US", {
          timeZone: "Asia/Dhaka",
        }),
      );

      const shiftEndDate = new Date(bangladeshPunchTime);
      const [endHour, endMin] = (employee.shiftEnd || "18:00")
        .split(":")
        .map(Number);
      shiftEndDate.setHours(endHour, endMin, 0, 0);
      const shiftEndTime = shiftEndDate;

      const outTime = new Date(lastOutPunch.timestamp);

      if (outTime > shiftEndTime) {
        const overtimeMinutes = getMinutesDifference(outTime, shiftEndTime);
        attendance.overtimeMinutes = overtimeMinutes;
        attendance.hasOvertime = true;
        attendance.earlyLeave = false;
        attendance.earlyLeaveMinutes = 0;
      } else if (outTime < shiftEndTime) {
        const earlyLeaveMinutes = getMinutesDifference(shiftEndTime, outTime);
        attendance.earlyLeaveMinutes = earlyLeaveMinutes;
        attendance.earlyLeave = true;
        attendance.overtimeMinutes = 0;
        attendance.hasOvertime = false;
      } else {
        attendance.overtimeMinutes = 0;
        attendance.earlyLeaveMinutes = 0;
        attendance.hasOvertime = false;
        attendance.earlyLeave = false;
      }
    }

    // ✅ Calculate break time and net working hours
    const { totalBreakMinutes, netWorkingMinutes } = calculateWorkingTime(
      attendance.punches,
    );
    attendance.totalBreakMinutes = totalBreakMinutes;
    attendance.netWorkingMinutes = netWorkingMinutes;
  }

  /**
   * Get users from device
   */
  async getUsers(device) {
    try {
      if (!device.isConnected) {
        await this.connectDevice(device);
      }

      console.log(
        `👥 Fetching users from ${device.config.name || device.config.ip}...`,
      );
      const users = await device.zkInstance.getUsers();
      console.log(`✅ Retrieved ${users.data.length} users`);

      return users.data;
    } catch (error) {
      console.error(`❌ Error fetching users:`, error.message);
      throw error;
    }
  }

  /**
   * Clear attendance logs from device
   */
  async clearAttendanceLogs(device) {
    try {
      if (!device.isConnected) {
        await this.connectDevice(device);
      }

      console.log(
        `🗑️ Clearing attendance logs from ${device.config.name || device.config.ip}...`,
      );
      await device.zkInstance.clearAttendanceLog();
      console.log(`✅ Attendance logs cleared`);

      return true;
    } catch (error) {
      console.error(`❌ Error clearing logs:`, error.message);
      throw error;
    }
  }

  /**
   * Get device info
   */
  async getDeviceInfo(device) {
    try {
      if (!device.isConnected) {
        await this.connectDevice(device);
      }

      const info = await device.zkInstance.getInfo();
      console.log(`ℹ️ Device info:`, info);

      return info;
    } catch (error) {
      console.error(`❌ Error getting device info:`, error.message);
      throw error;
    }
  }

  /**
   * Sync all devices (fetch and process logs)
   */
  async syncAllDevices() {
    console.log(`\n🔄 Starting sync for all devices...`);

    const results = [];

    for (const device of this.devices) {
      try {
        console.log(
          `\n📱 Syncing device: ${device.config.name || device.config.ip}`,
        );

        // Get attendance logs
        const logs = await this.getAttendanceLogs(device);

        // Process logs
        const result = await this.processAttendanceLogs(
          logs,
          device.config.name,
        );

        results.push({
          device: device.config.name || device.config.ip,
          success: true,
          ...result,
        });
      } catch (error) {
        console.error(
          `❌ Error syncing device ${device.config.name || device.config.ip}:`,
          error.message,
        );
        results.push({
          device: device.config.name || device.config.ip,
          success: false,
          error: error.message,
        });
      }
    }

    console.log(`\n✅ Sync completed for all devices`);
    return results;
  }

  /**
   * Disconnect from all devices
   */
  async disconnectAll() {
    console.log(`🔌 Disconnecting from all devices...`);

    await Promise.all(
      this.devices.map((device) => this.disconnectDevice(device)),
    );

    console.log(`✅ Disconnected from all devices`);
  }
}

// Create singleton instance
const zktecoService = new ZKTecoService();

module.exports = zktecoService;
