module.exports = {
  devices: [
    {
      ip: '192.168.1.201', // ✅ Replace with your device IP
      port: 4370,
      name: 'Main Office Entrance',
      timeout: 5000,
    },
    // Add more devices as needed
    // {
    //   ip: '192.168.1.202',
    //   port: 4370,
    //   name: 'Second Floor',
    //   timeout: 5000,
    // },
  ],
  
  // Auto-sync configuration
  autoSync: {
    enabled: true,
    interval: 300000, // 5 minutes (in milliseconds)
  },
};