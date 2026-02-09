const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Holiday = require('../models/Holiday');

// Helper function to parse time string (HH:mm) and create today's date with that time
const parseShiftTime = (timeString) => {
  const [hours, minutes] = timeString.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

// Helper function to calculate minutes difference
const getMinutesDifference = (time1, time2) => {
  return Math.floor((time1 - time2) / (1000 * 60));
};

// ✅ Helper function to convert UTC to Bangladesh Time and normalize to midnight
const getBangladeshDate = (date) => {
  const bangladeshTime = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  bangladeshTime.setHours(0, 0, 0, 0);
  return bangladeshTime;
};

// ✅ Helper function to get current time in Bangladesh
const getBangladeshTime = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
};

// ✅ Helper function to check if date is weekend
const isWeekend = (date) => {
  const day = new Date(date).getDay();
  return day === 5 || day === 6; // Friday = 5, Saturday = 6
};

// ✅ Helper function to check if date is holiday
const isHoliday = async (date) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  
  const holiday = await Holiday.findOne({
    date: normalizedDate
  });
  
  return !!holiday;
};

// Helper function to calculate break time and net working hours
const calculateWorkingTime = (punches) => {
  if (punches.length < 2) {
    return { totalBreakMinutes: 0, netWorkingMinutes: 0 };
  }

  let totalBreakMinutes = 0;
  let lastOutTime = null;

  const sortedPunches = [...punches].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  for (let i = 0; i < sortedPunches.length; i++) {
    const punch = sortedPunches[i];
    
    if (punch.type === 'OUT') {
      lastOutTime = new Date(punch.timestamp);
    } else if (punch.type === 'IN' && lastOutTime) {
      const breakMinutes = getMinutesDifference(new Date(punch.timestamp), lastOutTime);
      if (breakMinutes > 0) {
        totalBreakMinutes += breakMinutes;
      }
      lastOutTime = null;
    }
  }

  const firstIn = sortedPunches.find(p => p.type === 'IN');
  const lastOut = [...sortedPunches].reverse().find(p => p.type === 'OUT');

  let netWorkingMinutes = 0;
  if (firstIn && lastOut) {
    const totalMinutes = getMinutesDifference(
      new Date(lastOut.timestamp), 
      new Date(firstIn.timestamp)
    );
    netWorkingMinutes = totalMinutes - totalBreakMinutes;
  }

  return { totalBreakMinutes, netWorkingMinutes };
};

// @desc    Mark attendance (handles multiple punches + ZKTeco integration)
// @route   POST /api/attendance/mark
// @access  Public (or secured with API Key for device)
const markAttendance = async (req, res) => {
  const { employeeCode, timestamp, type, location, deviceId } = req.body;

  try {
    console.log(`📍 Marking attendance: ${employeeCode} - ${type} at ${timestamp}`);

    // Find employee by employeeCode OR biometricId (for ZKTeco)
    const employee = await Employee.findOne({
      $or: [
        { employeeCode },
        { biometricId: employeeCode }
      ]
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const punchTime = timestamp ? new Date(timestamp) : getBangladeshTime();
    const bangladeshPunchTime = new Date(punchTime.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
    const attendanceDate = getBangladeshDate(bangladeshPunchTime);
    
    console.log(`🕐 Punch time (Bangladesh): ${bangladeshPunchTime.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}`);
    console.log(`📅 Attendance date (Bangladesh): ${attendanceDate.toLocaleDateString('en-US', { timeZone: 'Asia/Dhaka' })}`);

    // ✅ Check if this is an off-day (weekend or holiday)
    const isOffDay = isWeekend(attendanceDate) || await isHoliday(attendanceDate);
    
    if (isOffDay) {
      console.log(`🎉 OFF-DAY DETECTED! This will be counted as overtime.`);
    }

    let attendance = await Attendance.findOne({
      employee: employee._id,
      date: attendanceDate,
    });

    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: attendanceDate,
        punches: [],
        isOffDay, // ✅ Mark if this is an off-day
      });
    }

    // ✅ Add punch to the punches array with Bangladesh time
    attendance.punches.push({
      timestamp: bangladeshPunchTime,
      type: type,
      location: location || 'Office',
      deviceId: deviceId || 'Manual',
    });

    console.log(`Total punches for the day: ${attendance.punches.length}`);

    // Sort punches by timestamp
    attendance.punches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Get first IN punch as office entry time
    const firstInPunch = attendance.punches.find(p => p.type === 'IN');
    if (firstInPunch) {
      attendance.inTime = firstInPunch.timestamp;
    }

    // Get last OUT punch as office exit time
    const lastOutPunch = [...attendance.punches].reverse().find(p => p.type === 'OUT');
    if (lastOutPunch) {
      attendance.outTime = lastOutPunch.timestamp;
    }

    // ✅ If it's an off-day, handle differently
    if (isOffDay) {
      attendance.status = 'Present';
      attendance.timingStatus = 'Off-Day Overtime';
      attendance.isOffDayWork = true;
      
      // Calculate total working time on off-day as overtime
      if (attendance.inTime && attendance.outTime) {
        const totalMinutes = getMinutesDifference(
          new Date(attendance.outTime),
          new Date(attendance.inTime)
        );
        
        // Calculate breaks
        const { totalBreakMinutes, netWorkingMinutes } = calculateWorkingTime(attendance.punches);
        attendance.totalBreakMinutes = totalBreakMinutes;
        attendance.netWorkingMinutes = netWorkingMinutes;
        
        // ✅ All working time on off-day is overtime
        attendance.overtimeMinutes = netWorkingMinutes;
        attendance.hasOvertime = true;
        attendance.earlyLeave = false;
        attendance.earlyLeaveMinutes = 0;
        attendance.lateMinutes = 0;
        
        console.log(`✅ Off-day overtime: ${netWorkingMinutes} minutes`);
      }
    } else {
      // Regular day - normal attendance logic
      
      // Calculate IN time status (only based on first punch)
      if (firstInPunch && type === 'IN' && attendance.punches.filter(p => p.type === 'IN').length === 1) {
        const shiftDate = new Date(bangladeshPunchTime);
        const [shiftHour, shiftMin] = (employee.shiftStart || '09:00').split(':').map(Number);
        shiftDate.setHours(shiftHour, shiftMin, 0, 0);
        const shiftStartTime = shiftDate;
        
        const gracePeriodEnd = new Date(shiftStartTime.getTime() + 30 * 60000);
        
        const [halfDayHour] = '12:00'.split(':').map(Number);
        const halfDayDate = new Date(bangladeshPunchTime);
        halfDayDate.setHours(halfDayHour, 0, 0, 0);
        const halfDayTime = halfDayDate;
        
        const inTime = new Date(firstInPunch.timestamp);
        const minutesBeforeShift = getMinutesDifference(shiftStartTime, inTime);
        const minutesAfterShift = getMinutesDifference(inTime, shiftStartTime);
        
        console.log(`⏰ Shift start: ${shiftStartTime.toLocaleTimeString()}, In time: ${inTime.toLocaleTimeString()}`);
        console.log(`⏱️ Minutes before/after shift: ${minutesBeforeShift} / ${minutesAfterShift}`);
        
        if (inTime < shiftStartTime) {
          attendance.status = 'Present';
          attendance.lateMinutes = 0;
          attendance.isEarly = true;
          attendance.earlyMinutes = minutesBeforeShift;
          attendance.timingStatus = 'Early';
        } else if (inTime <= gracePeriodEnd) {
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.usedGracePeriod = minutesAfterShift > 0;
          attendance.timingStatus = minutesAfterShift === 0 ? 'On Time' : 'On Time (Grace)';
        } else if (inTime > gracePeriodEnd && inTime < halfDayTime) {
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.timingStatus = 'Late';
        } else if (inTime >= halfDayTime) {
          attendance.status = 'Present';
          attendance.lateMinutes = minutesAfterShift;
          attendance.isHalfDay = true;
          attendance.timingStatus = 'Half Day';
        }
      }

      // Calculate OUT time status (only based on last OUT punch)
      if (lastOutPunch) {
        const shiftEndDate = new Date(bangladeshPunchTime);
        const [endHour, endMin] = (employee.shiftEnd || '18:00').split(':').map(Number);
        shiftEndDate.setHours(endHour, endMin, 0, 0);
        const shiftEndTime = shiftEndDate;
        
        const outTime = new Date(lastOutPunch.timestamp);
        
        console.log(`⏰ Shift end: ${shiftEndTime.toLocaleTimeString()}, Out time: ${outTime.toLocaleTimeString()}`);
        
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

      // Calculate break time and net working hours
      const { totalBreakMinutes, netWorkingMinutes } = calculateWorkingTime(attendance.punches);
      attendance.totalBreakMinutes = totalBreakMinutes;
      attendance.netWorkingMinutes = netWorkingMinutes;
    }

    // Set status to Present if inTime exists
    if (attendance.inTime && !attendance.status) {
      attendance.status = 'Present';
    }

    await attendance.save();

    console.log(`✅ Attendance saved - Date: ${attendanceDate.toLocaleDateString()}, Total breaks: ${attendance.totalBreakMinutes} min, Net working: ${attendance.netWorkingMinutes} min`);

    res.status(200).json({ 
      message: 'Attendance marked successfully', 
      attendance,
      punchCount: attendance.punches.length,
      totalBreakMinutes: attendance.totalBreakMinutes,
      netWorkingMinutes: attendance.netWorkingMinutes,
      timingStatus: attendance.timingStatus,
      lateMinutes: attendance.lateMinutes,
      overtimeMinutes: attendance.overtimeMinutes,
      earlyLeaveMinutes: attendance.earlyLeaveMinutes,
      isOffDay: attendance.isOffDay,
      isOffDayWork: attendance.isOffDayWork,
      bangladeshTime: bangladeshPunchTime.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get attendance records
// @route   GET /api/attendance
// @access  Private
const getAttendance = async (req, res) => {
  try {
    const { startDate, endDate, employeeId } = req.query;
    const query = {};

    if (startDate && endDate) {
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T23:59:59');
      
      query.date = { $gte: start, $lte: end };
    }

    if (employeeId) {
      query.employee = employeeId;
    }

    const attendance = await Attendance.find(query)
      .populate('employee', 'firstName lastName employeeCode shiftStart shiftEnd')
      .sort({ date: -1 });
    
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get attendance by ID with punch details
// @route   GET /api/attendance/:id
// @access  Private
const getAttendanceById = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('employee', 'firstName lastName employeeCode shiftStart shiftEnd');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Manual Attendance Update (Audit Log)
// @route   PUT /api/attendance/:id
// @access  Private/Admin/HR
const manualAttendance = async (req, res) => {
  try {
    const { inTime, outTime, status, reason } = req.body;
    const attendance = await Attendance.findById(req.params.id).populate('employee');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    if (attendance.isLocked) {
      return res.status(400).json({ message: 'Attendance is locked for payroll' });
    }

    const previousValue = {
      inTime: attendance.inTime,
      outTime: attendance.outTime,
      status: attendance.status
    };

    if (inTime) {
      const bangladeshInTime = new Date(new Date(inTime).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
      attendance.inTime = bangladeshInTime;
    }
    
    if (outTime) {
      const bangladeshOutTime = new Date(new Date(outTime).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
      attendance.outTime = bangladeshOutTime;
      
      // Recalculate overtime/early leave
      const employee = attendance.employee;
      const shiftEndDate = new Date(bangladeshOutTime);
      const [endHour, endMin] = (employee.shiftEnd || '18:00').split(':').map(Number);
      shiftEndDate.setHours(endHour, endMin, 0, 0);
      const shiftEndTime = shiftEndDate;
      
      if (bangladeshOutTime > shiftEndTime) {
        attendance.overtimeMinutes = getMinutesDifference(bangladeshOutTime, shiftEndTime);
        attendance.hasOvertime = true;
        attendance.earlyLeave = false;
        attendance.earlyLeaveMinutes = 0;
      } else if (bangladeshOutTime < shiftEndTime) {
        attendance.earlyLeaveMinutes = getMinutesDifference(shiftEndTime, bangladeshOutTime);
        attendance.earlyLeave = true;
        attendance.overtimeMinutes = 0;
        attendance.hasOvertime = false;
      }
    }
    
    if (status) attendance.status = status;
    attendance.isEdited = true;

    attendance.auditLog.push({
      modifiedBy: req.user._id,
      previousValue,
      reason
    });

    await attendance.save();
    res.json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Export helper functions for ZKTeco service to use
module.exports = { 
  markAttendance, 
  getAttendance, 
  getAttendanceById, 
  manualAttendance,
  // Export helpers for ZKTeco integration
  calculateWorkingTime,
  getMinutesDifference,
  parseShiftTime,
  getBangladeshDate,
  getBangladeshTime,
  isWeekend,
  isHoliday
};