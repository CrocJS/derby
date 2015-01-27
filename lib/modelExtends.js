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

function indexOf(arr, item) {
  if (Array.isArray(arr)) {
    return arr.indexOf(item);
  }
  else {
    for (var i in arr) {
      if (arr[i] === item) {
        return i;
      }
    }
    return -1;
  }
}

Model.prototype.checkItem = function(checkedProp, checkedPath, arrPath) {
  var oldCheckedItem;
  var model = this;
  
  function listener(checkedItem) {
    if (checkedItem === oldCheckedItem) {
      return;
    }
  
    var arr = model.get(arrPath);
  
    if (oldCheckedItem) {
      var oldIndex = indexOf(arr, oldCheckedItem);
      if (oldIndex !== -1) {
        model.del(arrPath + '.' + oldIndex + '.' + checkedProp);
      }
      else {
        delete oldCheckedItem[checkedProp];
      }
    }
  
    if (checkedItem) {
      var index = indexOf(arr, checkedItem);
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