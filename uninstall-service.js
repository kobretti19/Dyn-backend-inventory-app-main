const Service = require('node-windows').Service;
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'DYNAVOX Inventory Server',
  script: path.join(__dirname, 'server.js'),
});

// Listen for the "uninstall" event
svc.on('uninstall', function () {
  console.log('Service uninstalled successfully!');
  console.log('The service exists:', svc.exists);
});

// Uninstall the service
svc.uninstall();
