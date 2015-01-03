var util = require('racer/lib/util');
var Model = require('./RendererModel');
var EventEmitter = require('events').EventEmitter;

module.exports = function(Derby) {
  util.mergeInto(Derby.prototype, EventEmitter.prototype);

  Derby.prototype.Model = Model;
  Derby.prototype.util = util;

  // Support plugins on racer instances
  Derby.prototype.use = util.use;
  Derby.prototype.serverUse = util.serverUse;
};