const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'DYNAVOX Inventory Server',
  description: 'DYNAVOX Inventory Management System Backend Server',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: ['--harmony', '--max_old_space_size=4096'],
  env: [
    {
      name: 'NODE_ENV',
      value: 'production',
    },
    {
      name: 'PORT',
      value: '3000',
    },
  ],
});

// Listen for the "install" event
svc.on('install', function () {
  console.log('Service installed successfully!');
  svc.start();
  console.log('Service started!');
});

// Listen for errors
svc.on('error', function (err) {
  console.error('Service error:', err);
});

// Install the service
svc.install();
