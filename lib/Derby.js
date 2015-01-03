/*
 * Derby.js
 * Meant to be the entry point for the framework.
 *
 */

var EventEmitter = require('events').EventEmitter;
var util = require('racer/lib/util');
var App = require('./App');
var Page = require('./Page');
var components = require('./components');

module.exports = Derby;

function Derby() {
  if (process.env.DERBY_RENDERER) EventEmitter.call(this);
}

(util.serverRequire(module, './_mode') || require('derbyMode'))(Derby);

Derby.prototype.App = App;
Derby.prototype.Page = Page;
Derby.prototype.Component = components.Component;

Derby.prototype.createApp = function(name, filename) {
  return new App(this, name, filename);
};

/**
 * @param options
 * @param options.name
 * @param options.entry
 * @param [options.callback]
 * @param [options.meta]
 * @returns {Function}
 */
Derby.prototype.appFactory = function(options) {
  var app = this.createApp(options.name, options.entry);
  app.meta = options.meta || {};
  if (options.callback) options.callback(app);
  return function factory() {
    return app;
  }
};

if (!util.isServer) {
  require('./documentListeners').add(document);
}

util.serverRequire(module, './Derby.server');