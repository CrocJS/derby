var util = require('racer/lib/util');
var Model = require('./RendererModel');

module.exports = function(Derby) {
  util.mergeInto(Derby.prototype, EventEmitter.prototype);

  Derby.prototype.Model = RendererModel;
  Derby.prototype.util = util;

  // Support plugins on racer instances
  Derby.prototype.use = util.use;
  Derby.prototype.serverUse = util.serverUse;
};