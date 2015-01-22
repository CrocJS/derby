var Model = module.exports = require('racer/lib/Model/Model');

Model.prototype.removeItem = function(path, item) {
  if (arguments.length === 1) {
    item = path;
    return this.remove(this.get().indexOf(item));
  } else {
    return this.remove(path, this.get(path).indexOf(item));
  }
};
Model.prototype.delItem = function(path, item) {
  return this.del(path + '.' + this.get(path).indexOf(item));
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

Model.prototype.liveQuery = function(options) {
  var path = options.path;
  var loading = options.loading;
  var collection = options.collection;
  var paramsCb = options.params;
  var params = options.inputs;

  if (loading) {
    this.set(loading, false);
  }

  var query;
  var listener = function() {
    if (query) {
      this.unsubscribe(query);
    }
    var parameters = paramsCb.apply(global, params.map(function(x) { return this.get(x); }, this));
    query = this.root.query(collection, parameters);
    if (loading) {
      this.set(loading, true);
    }
    this.subscribe(query, function() {
      query.ref(this.at(path));
      this.set(loading, false);
    }.bind(this));
  }.bind(this);

  params.forEach(function(param) {
    this.on('all', param, listener);
  }, this);
  listener();
};

Model.prototype.checkItem = function(checkedProp, checkedPath, arrPath) {
  var oldCheckedItem;
  var model = this;
  
  function listener(checkedItem) {
    if (checkedItem === oldCheckedItem) {
      return;
    }
  
    var arr = model.get(arrPath);
  
    if (oldCheckedItem) {
      var oldIndex = arr.indexOf(oldCheckedItem);
      if (oldIndex !== -1) {
        model.del(arrPath + '.' + oldIndex + '.' + checkedProp);
      }
      else {
        delete oldCheckedItem[checkedProp];
      }
    }
  
    if (checkedItem) {
      var index = arr.indexOf(checkedItem);
      if (index !== -1) {
        model.set(arrPath + '.' + index + '.' + checkedProp, true);
      }
      else {
        checkedItem[checkedProp] = true;
      }
    }
    oldCheckedItem = checkedItem;
  }
  
  this.on('change', checkedPath, listener);
  listener(this.get(checkedPath));
};