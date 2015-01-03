var Model = module.exports = require('racer/lib/Model/Model');

require('racer/lib/Model/unbundle');
require('racer/lib/Model/events');
require('racer/lib/Model/paths');
require('racer/lib/Model/collections');
require('racer/lib/Model/mutators');
require('racer/lib/Model/setDiff');

require('racer/lib/Model/fn');
require('racer/lib/Model/filter');
require('racer/lib/Model/refList');
require('racer/lib/Model/ref');

require('./modelExtends');

require('racer/lib/util').serverRequire(module, 'racer/lib/Model/bundle');

//stub from connection
Model.prototype.whenNothingPending = function(cb) {
  cb();
};
Model.prototype._isLocal = function(name) {
  return true;
};
Model.prototype._queries = {
  toJSON: function() {
    return [];
  }
};
Model.prototype._initQueries = function() {};