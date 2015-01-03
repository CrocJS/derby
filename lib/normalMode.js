var racer = require('racer');
var tracks = require('tracks');
require('./modelExtends');

module.exports = function(Derby) {
  Derby.prototype = racer;
  Derby.prototype.tracks = tracks;
};