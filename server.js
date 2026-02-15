const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const zktecoService = require('./services/zktecoService'); // ✅ Import ZKTeco service
const zktecoConfig = require('./config/zkteco.config'); // ✅ Import config

dotenv.config();
connectDB();

const app = express();

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`\n🔵 Incoming Request: ${req.method} ${req.path}`);
  console.log('Raw Headers:', req.headers);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // ✅ Fixed typo here

// Verify body parser is working
app.use((req, res, next) => {
  console.log('✅ After body parser - Body:', req.body);
  next();
});

app.get('/', (req, res) => {
  res.send('API is running...');
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/lates', require('./routes/lateRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/holidays', require('./routes/holidayRoutes'));
app.use('/api/roles', require('./routes/roleRoutes'));
app.use('/api/zkteco', require('./routes/zktecoRoutes'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Internal Server Error',
  });
});

// ✅ Initialize ZKTeco devices
const initializeZKTeco = async () => {
  try {
    console.log('\n🔧 Initializing ZKTeco devices...');
    
    // Add configured devices
    zktecoConfig.devices.forEach(deviceConfig => {
      zktecoService.addDevice(deviceConfig);
    });
    
    // Connect to devices
    await zktecoService.connectAllDevices();
    
    // Setup auto-sync if enabled
    if (zktecoConfig.autoSync.enabled) {
      console.log(`⏰ Setting up auto-sync every ${zktecoConfig.autoSync.interval / 1000} seconds`);
      
      setInterval(async () => {
        console.log('\n⏰ Running scheduled sync...');
        try {
          await zktecoService.syncAllDevices();
        } catch (error) {
          console.error('❌ Auto-sync error:', error.message);
        }
      }, zktecoConfig.autoSync.interval);
    }
    
    console.log('✅ ZKTeco initialization complete\n');
  } catch (error) {
    console.error('❌ ZKTeco initialization error:', error.message);
  }
};


const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  
  // ✅ Initialize ZKTeco after server starts
  await initializeZKTeco();
});

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⚠️ Shutting down gracefully...');
  await zktecoService.disconnectAll();
  process.exit(0);
});