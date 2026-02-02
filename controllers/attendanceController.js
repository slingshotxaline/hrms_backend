const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

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

// ✅ Helper function to calculate break time and net working hours
const calculateWorkingTime = (punches) => {
  if (punches.length < 2) {
    return { totalBreakMinutes: 0, netWorkingMinutes: 0 };
  }

  let totalBreakMinutes = 0;
  let lastOutTime = null;

  // Sort punches by timestamp
  const sortedPunches = [...punches].sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );

  for (let i = 0; i < sortedPunches.length; i++) {
    const punch = sortedPunches[i];
    
    if (punch.type === 'OUT') {
      lastOutTime = new Date(punch.timestamp);
    } else if (punch.type === 'IN' && lastOutTime) {
      // Calculate break time between OUT and next IN
      const breakMinutes = getMinutesDifference(new Date(punch.timestamp), lastOutTime);
      if (breakMinutes > 0) {
        totalBreakMinutes += breakMinutes;
      }
      lastOutTime = null;
    }
  }

  // Calculate total time (first IN to last OUT)
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

// @desc    Mark attendance (handles multiple punches)
// @route   POST /api/attendance/mark
// @access  Public (or secured with API Key for device)
const markAttendance = async (req, res) => {
  const { employeeCode, timestamp, type, location, deviceId } = req.body;

  try {
    console.log(`📍 Marking attendance: ${employeeCode} - ${type} at ${timestamp}`);

    const employee = await Employee.findOne({ employeeCode });
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const punchTime = new Date(timestamp);
    const date = new Date(punchTime);
    date.setHours(0, 0, 0, 0); // Normalize to midnight for query

    let attendance = await Attendance.findOne({
      employee: employee._id,
      date: date,
    });

    if (!attendance) {
      attendance = new Attendance({
        employee: employee._id,
        date: date,
        punches: [],
      });
    }

    // ✅ Add punch to the punches array
    attendance.punches.push({
      timestamp: punchTime,
      type: type,
      location: location || 'Office',
      deviceId: deviceId || 'Manual',
    });

    console.log(`Total punches for the day: ${attendance.punches.length}`);

    // ✅ Sort punches by timestamp
    attendance.punches.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // ✅ Get first IN punch as office entry time
    const firstInPunch = attendance.punches.find(p => p.type === 'IN');
    if (firstInPunch) {
      attendance.inTime = firstInPunch.timestamp;
    }

    // ✅ Get last OUT punch as office exit time
    const lastOutPunch = [...attendance.punches].reverse().find(p => p.type === 'OUT');
    if (lastOutPunch) {
      attendance.outTime = lastOutPunch.timestamp;
    }

    // ✅ Calculate IN time status (only based on first punch)
    if (firstInPunch && type === 'IN' && attendance.punches.filter(p => p.type === 'IN').length === 1) {
      const shiftStartTime = parseShiftTime(employee.shiftStart || '09:00');
      const gracePeriodEnd = new Date(shiftStartTime.getTime() + 30 * 60000);
      const halfDayTime = parseShiftTime('12:00');
      
      const inTime = new Date(firstInPunch.timestamp);
      const minutesBeforeShift = getMinutesDifference(shiftStartTime, inTime);
      const minutesAfterShift = getMinutesDifference(inTime, shiftStartTime);
      
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

    // ✅ Calculate OUT time status (only based on last OUT punch)
    if (lastOutPunch) {
      const shiftEndTime = parseShiftTime(employee.shiftEnd || '18:00');
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
    const { totalBreakMinutes, netWorkingMinutes } = calculateWorkingTime(attendance.punches);
    attendance.totalBreakMinutes = totalBreakMinutes;
    attendance.netWorkingMinutes = netWorkingMinutes;

    // Set status to Present if inTime exists
    if (attendance.inTime && !attendance.status) {
      attendance.status = 'Present';
    }

    await attendance.save();

    console.log(`✅ Attendance saved - Total breaks: ${totalBreakMinutes} min, Net working: ${netWorkingMinutes} min`);

    res.status(200).json({ 
      message: 'Attendance marked successfully', 
      attendance,
      punchCount: attendance.punches.length,
      totalBreakMinutes,
      netWorkingMinutes,
      timingStatus: attendance.timingStatus,
      lateMinutes: attendance.lateMinutes,
      overtimeMinutes: attendance.overtimeMinutes,
      earlyLeaveMinutes: attendance.earlyLeaveMinutes
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
      query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
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

    if (inTime) attendance.inTime = new Date(inTime);
    if (outTime) {
      attendance.outTime = new Date(outTime);
      
      // Recalculate overtime/early leave
      const employee = attendance.employee;
      const shiftEndTime = parseShiftTime(employee.shiftEnd || '18:00');
      const outTimeDate = new Date(outTime);
      
      if (outTimeDate > shiftEndTime) {
        attendance.overtimeMinutes = getMinutesDifference(outTimeDate, shiftEndTime);
        attendance.hasOvertime = true;
        attendance.earlyLeave = false;
        attendance.earlyLeaveMinutes = 0;
      } else if (outTimeDate < shiftEndTime) {
        attendance.earlyLeaveMinutes = getMinutesDifference(shiftEndTime, outTimeDate);
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

module.exports = { 
  markAttendance, 
  getAttendance, 
  getAttendanceById, 
  manualAttendance 
};