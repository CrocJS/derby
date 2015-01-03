var Model = module.exports = require('racer/lib/Model/Model');

Model.prototype.removeItem = function(path, item) {
  if (arguments.length === 1) {
    item = path;
    return this.remove(this.get().indexOf(item));
  } else {
    return this.remove(path, this.get(path).indexOf(item));
  }
};

/**
 * @param dest
 * @param source
 * @param filter
 * @param [options]
 * @param [options.skip]
 * @param [options.limit]
 */
Model.prototype.filterArray = function(dest, source, filter, options) {
  var args = Array.prototype.slice.call(arguments);
  var addParamsEnd = -1;
  filter = args[args.length - 1];
  if (typeof filter === 'object') {
    addParamsEnd = -2;
    options = filter;
    filter = args[args.length - 2];
  }

  if (!options) options = {};

  var addWild = Array.prototype.slice.call(args, 2, addParamsEnd);
  var addPath = addWild.map(function(x) { return x.split('.*').join(''); });

  var listener = function() {
    var arr = this.get(source);
    var add = addPath.map(function(x) { return this.get(x); }, this);
    if (!Array.isArray(arr)) {
      this.set(dest, []);
      return;
    }
    var from = options.skip || 0;
    var to = options.limit ? from + options.limit : Number.MAX_VALUE;
    var found = 0;
    var foundLimit = options.foundLimit || Number.MAX_VALUE;
    this.setArrayDiff(dest, arr.filter(function(x, i) {
      var result = found < foundLimit && i >= from && i < to && filter.apply(global, [x, i].concat(add));
      if (result) {
        found += 1;
      }
      return result;
    }));
  }.bind(this);

  this.on('all', source, listener);
  addWild.forEach(function(add) {
    this.on('all', add, listener);
  }, this);
  listener();
};

Model.prototype.refLive = function(dest, source) {
  var model = this;
  var listeners = [];

  function removeListeners() {
    listeners.forEach(function(listener) {
      model.removeListener('all', listener);
    });
    listeners = [];
  }

  if (!model.$$liveRefs) model.$$liveRefs = {};

  function addListeners() {
    model.$$liveRefs[dest] = removeListeners;

    var segments = source.split('.');
    var key = '';
    segments.forEach(function(segment, index) {
      if (index === segments.length - 1) {
        return;
      }

      key += (key && '.') + segment;
      var curKey = key;
      var arr = model.get(curKey);

      if (Array.isArray(arr)) {
        var arrIndex = +segments[index + 1];
        var arrValue = arr[arrIndex];

        var listener = function() {
          var newIndex = arr.indexOf(arrValue);
          if (arrIndex !== newIndex) {
            model.removeRef(dest);
            if (newIndex !== -1) {
              segments[index + 1] = newIndex;
              source = segments.join('.');
              model.ref(dest, source);
              addListeners();
            }
          }
        };
        listeners.push(model.on('all', curKey, listener));
      }
    });
  }

  model.ref(dest, source);
  addListeners();
};

var oldRemoveRef = Model.prototype.removeRef;
Model.prototype.removeRef = function(dest) {
  if (this.$$liveRefs && this.$$liveRefs[dest]) {
    this.$$liveRefs[dest]();
    delete this.$$liveRefs[dest];
  }
  return oldRemoveRef.apply(this, arguments);
};