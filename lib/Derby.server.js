var cluster = require('cluster');
var Derby = require('./Derby');
var util = require('racer/lib/util');
var EventEmitter = require('events').EventEmitter;

// Extend template types with html parsing on server
require('derby-parsing');

util.isProduction = process.env.NODE_ENV === 'production';

if (process.env.DERBY_RENDERER) {
  //stub Store for racer-bundle plugin
  function Store() {
    EventEmitter.call(this);
  }

  util.mergeInto(Store.prototype, EventEmitter.prototype);
  Derby.prototype.Store = Store;
  Derby.prototype.store = new Store();
}
if (!('DERBY_SCRIPT_DIR' in process.env)) process.env.DERBY_SCRIPT_DIR = 'derby';

Derby.prototype.run = function(createServer) {
  // In production
  if (this.util.isProduction) return createServer();
  if (cluster.isMaster) {
    console.log('Master pid ', process.pid);
    startWorker();
  } else {
    createServer();
  }
};

function startWorker() {
  var worker = cluster.fork();
  worker.once('disconnect', function () {
    worker.process.kill();
  });
  worker.on('message', function(message) {
    if (message.type === 'reload') {
      if (worker.disconnecting) return;
      console.log('Killing %d', worker.process.pid);
      worker.process.kill();
      worker.disconnecting = true;
      startWorker();
    }
  });
}

var coreApps = {};
Derby.prototype.appFactory = function(options) {
  var derby = this;
  function factory(packageName, packageEntryPoint) {
    if (!packageName && coreApps[options.name]) {
      return coreApps[options.name];
    }
    var app = derby.createApp(options.name + (packageName ? ':' + packageName : ''),
      packageEntryPoint || options.entry);
    app.meta = options.meta || {};
    if (packageName) {
      app.isPackage = true;
      app.coreApp = coreApps[options.name];
      app.Page.prototype = app.coreApp.Page.prototype;
      app.proto = app.coreApp.proto;
    }
    else {
      coreApps[options.name] = app.coreApp = app;
    }
    if (options.callback) options.callback(app);
    return app;
  }
  app = factory();
  app.factory = factory;
  return app;
};