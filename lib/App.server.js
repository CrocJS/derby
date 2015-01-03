/*
 * App.server.js
 *
 * Application level functionality that is
 * only applicable to the server.
 *
 */

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var chokidar = require('chokidar');
var through = require('through');
var derbyTemplates = require('derby-templates');
var util = require('racer/lib/util');
var App = require('./App');
var files = require('./files');
var Model = process.env.DERBY_RENDERER ? require('./RendererModel') : require('racer').Model;
var Page = require('./Page');

var STYLE_EXTENSIONS = ['.css'];
var VIEW_EXTENSIONS = ['.html'];
var COMPILERS = {
  '.css': files.cssCompiler
, '.html': files.htmlCompiler
};

var packageViewsPath = require.resolve('./_packageViews');
var viewsPath = require.resolve('./_views');

App.prototype._init = function() {
  this.scriptFilename = null;
  this.scriptMapFilename = null;
  this.derbyBase = process.env.DERBY_SCRIPT_DIR ? '/' + process.env.DERBY_SCRIPT_DIR + '/' : '/';
  this.scriptUrl = this.derbyBase + this.name + '.js';
  this.scriptMapUrl = null;
  this.clients = null;
  this.styleExtensions = STYLE_EXTENSIONS.slice();
  this.viewExtensions = VIEW_EXTENSIONS.slice();
  this.compilers = util.copyObject(COMPILERS);

  this.serializedDir = path.dirname(this.filename) + '/derby-serialized';
  this.serializedBase = this.serializedDir + '/' + this.name;
  if (fs.existsSync(this.serializedBase + '.json')) {
    this.deserialize();
    this.loadViews = function() {};
    this.loadStyles = function() {};
    return;
  }
  this.views.register('Page',
    '<!DOCTYPE html>' +
    '<meta charset="utf-8">' +
    '<view name="{{$render.prefix}}TitleElement"></view>' +
    '<view name="{{$render.prefix}}Styles"></view>' +
    '<view name="{{$render.prefix}}Head"></view>' +
    '<view name="{{$render.prefix}}BodyElement"></view>',
    {serverOnly: true}
  );
  this.views.register('TitleElement',
    '<title><view name="{{$render.prefix}}Title"></view></title>'
  );
  if (process.env.DERBY_FLEXIBLE_PAGE_RENDER) {
    this.views.register('BodyElement', '' +
    '<body class="{{$bodyClass($render.ns)}}">' +
    '<view name="{{$render.prefix}}Body"></view>' +
    '<view name="{{$render.prefix}}BodyServer" optional></view>' +
    '</body>');
  } else {
    this.views.register('BodyElement',
      '<body class="{{$bodyClass($render.ns)}}">' +
      '<view name="{{$render.prefix}}Body"></view>'
    );
  }

  this.views.register('Title', 'Derby App');
  this.views.register('Styles', '', {serverOnly: true});
  this.views.register('Head', '', {serverOnly: true});
  this.views.register('Body', '');
  this.views.register('Tail', '');
};

App.prototype.createPage = function(req, res, next) {
  var model = (req && req.getModel && req.getModel()) || new Model({fetchOnly: !!process.env.DERBY_RENDERER});
  this.emit('model', model);
  var page = new this.Page(this, model, req || {}, res);
  if (next) {
    model.on('error', next);
    page.on('error', next);
  }
  return page;
};

App.prototype.bundle = function(store, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = null;
  }
  options || (options = {});
  if (options.minify == null) options.minify = util.isProduction;
  // Turn all of the app's currently registered views into a javascript
  // function that can recreate them in the client

  //exclude views duplicates for packages
  if (this.isPackage) {
    var coreViews = this.coreApp.views.nameMap;
    var views = this.views.nameMap;
    for (var viewName in views) {
      if (coreViews[viewName]) {
        var view = views[viewName];
        if (view.options) {
          view.options.serverOnly = true;
        }
        else {
          view.options = {serverOnly: true};
        }
      }
    }
  }

  this.bundleFiles = [];
  this.bundling = true;
  var app = this;
  this.derby.store.once('bundle', function(bundle) {
    var viewsFilename = app.isPackage ? packageViewsPath : viewsPath;
    bundle.require(path.dirname(__dirname), {expose: 'derby'});

    if (app.isPackage) {
      bundle.require(viewsFilename, {expose: app.isPackage ? '_packageViews' : '_views'});
      app.coreApp.bundleFiles.forEach(function(file) {
        if (file !== viewsFilename) bundle.external(file);
      });
    }
    else {
      var modeFilename = process.env.DERBY_RENDERER ? './rendererMode.js' : './normalMode.js';
      bundle.require(require.resolve(modeFilename), {expose: 'derbyMode'});
      bundle.require(packageViewsPath, {expose: '_packageViews'});
    }

    // Hack to inject the views script into the Browserify bundle by replacing
    // the empty _views.js file with the generated source
    bundle.transform(function(filename) {
      if (filename !== viewsFilename) return through();
      return through(
        function write() {}
        , function end() {
          this.queue(app._viewsSource(options));
          this.queue(null);
        }
      );
    });
    bundle.on('file', function(filename) {
      app.bundleFiles.push(filename);
    });

    app.emit('bundle', bundle);
  });

  store.bundle(app.filename, options, function(err, source, map) {
    if (err) return cb(err);
    app.scriptHash = crypto.createHash('md5').update(source).digest('hex');
    source = source.replace('{{DERBY_SCRIPT_HASH}}', app.scriptHash);
    source = source.replace(/['"]{{DERBY_BUNDLED_AT}}['"]/, Date.now());
    if (!process.env.DERBY_RENDERER && !util.isProduction) {
      app._autoRefresh(store);
      app._watchBundle(app.bundleFiles);
    }
    if (cb) cb(null, source, map);
    app.bundled = true;
    app.emit('bundled');
  });
};

App.prototype.writeScripts = function(store, dir, options, cb) {
  var app = this;
  if (typeof store === 'string' && process.env.DERBY_RENDERER) {
    cb = options;
    options = dir;
    dir = store;
    store = this.derby.store;
  }

  //write core script first if package script writing requested
  if (this.isPackage && !this.coreApp.bundled) {
    this.coreApp.once('bundled', function() {
      app.writeScripts(store, dir, options, cb);
    });
    if (!this.coreApp.bundling) this.coreApp.writeScripts(store, dir, options);
    return;
  }

  options.exposeAll = true;
  this.bundle(store, options, function(err, source, map) {
    if (err) return cb(err);
    if (process.env.DERBY_SCRIPT_DIR) dir = path.join(dir, process.env.DERBY_SCRIPT_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    var filename = app.name + (!process.env.DERBY_RENDERER ? '-' + app.scriptHash : '');
    var base = path.join(dir, filename);

    // Write current map and bundle files
    if (!(options && options.disableScriptMap)) {
      app.scriptMapUrl = app.derbyBase + filename + '.map.json';
      source += '\n//# sourceMappingURL=' + app.scriptMapUrl;
      app.scriptMapFilename = base + '.map.json';
      fs.writeFileSync(app.scriptMapFilename, map, 'utf8');
    }
    app.scriptFilename = base + '.js';
    fs.writeFileSync(app.scriptFilename, source, 'utf8');

    // Delete app bundles with same name in development so files don't
    // accumulate. Don't do this automatically in production, since there could
    // be race conditions with multiple processes intentionally running
    // different versions of the app in parallel out of the same directory,
    // such as during a rolling restart.
    if (!process.env.DERBY_RENDERER && !util.isProduction) {
      var filenames = fs.readdirSync(dir);
      for (var i = 0; i < filenames.length; i++) {
        var item = filenames[i].split(/[-.]/);
        if (item[0] === app.name && item[1] !== app.scriptHash) {
          var oldFilename = path.join(dir, filenames[i]);
          fs.unlinkSync(oldFilename);
        }
      }
    }
    if (cb) cb();
  });
};

App.prototype._viewsSource = function(options) {
  var result = '/*DERBY_SERIALIZED_VIEWS*/';
  if (this.isPackage) {
    result += 'module.exports = ' + this.views.serialize(options) + ';';
  } else {
    result += 'module.exports = function(){window.require("_packageViews").apply(this, arguments);(' +
    this.views.serialize(options) + ').apply(this, arguments);};';
  }
  result += '/*DERBY_SERIALIZED_VIEWS_END*/';
  return result;
};

App.prototype.serialize = function() {
  if (!fs.existsSync(this.serializedDir)) {
    fs.mkdirSync(this.serializedDir);
  }
  // Don't minify the views (which doesn't include template source), since this
  // is for use on the server
  var viewsSource = this._viewsSource({server: true, minify: false});
  fs.writeFileSync(this.serializedBase + '.views.js', viewsSource, 'utf8');
  var serialized = JSON.stringify({
    scriptUrl: this.scriptUrl
  , scriptMapUrl: this.scriptMapUrl
  });
  fs.writeFileSync(this.serializedBase + '.json', serialized, 'utf8');
};

App.prototype.deserialize = function() {
  var serializedViews = require(this.serializedBase + '.views.js');
  var serialized = require(this.serializedBase + '.json');
  serializedViews(derbyTemplates, this.views);
  this.scriptUrl = serialized.scriptUrl;
  this.scriptMapUrl = serialized.scriptMapUrl;
};

App.prototype.loadViews = function(filename, namespace, options) {
  var data = files.loadViewsSync(this, filename, namespace);
  for (var i = 0, len = data.views.length; i < len; i++) {
    var item = data.views[i];
    if (options) util.mergeInto(item.options, options);
    this.views.register(item.name, item.source, item.options);
  }
  if (!process.env.DERBY_RENDERER) this._watchViews(data.files, filename, namespace);
  // Make chainable
  return this;
};

App.prototype.loadStyles = function(filename, options) {
  this._loadStyles(filename, options);
  var stylesView = this.views.find('Styles');
  stylesView.source += '<view name="' + filename + '"></view>';
  // Make chainable
  return this;
};

App.prototype._loadStyles = function(filename, options) {
  var styles = files.loadStylesSync(this, filename, options);
  this.views.register(filename, '<style>' + styles.css + '</style>', {serverOnly: true});
  if (!process.env.DERBY_RENDERER) this._watchStyles(styles.files, filename, options);
};

App.prototype._watchViews = function(filenames, filename, namespace) {
  var app = this;
  var watcher = chokidar.watch(filenames);
  watcher.on('change', function() {
    watcher.close();
    app.loadViews(filename, namespace);
    app._updateScriptViews();
    app._refreshClients();
  });
};

App.prototype._watchStyles = function(filenames, filename, options) {
  var app = this;
  var watcher = chokidar.watch(filenames);
  watcher.on('change', function() {
    watcher.close();
    app._loadStyles(filename, options);
    app._updateScriptViews();
    app._refreshClients();
  });
};

App.prototype._watchBundle = function(filenames) {
  if (!process.send) return;
  var app = this;
  var watcher = chokidar.watch(filenames);
  watcher.on('change', function() {
    watcher.close();
    process.send({type: 'reload'});
  });
};

App.prototype._updateScriptViews = function() {
  if (!this.scriptFilename) return;
  var script = fs.readFileSync(this.scriptFilename, 'utf8');
  var i = script.indexOf('/*DERBY_SERIALIZED_VIEWS*/');
  var before = script.slice(0, i);
  var i = script.indexOf('/*DERBY_SERIALIZED_VIEWS_END*/');
  var after = script.slice(i + 30);
  var viewsSource = this._viewsSource();
  fs.writeFileSync(this.scriptFilename, before + viewsSource + after, 'utf8');
};

App.prototype._autoRefresh = function(store) {
  var clients = this.clients = {};
  var app = this;
  store.on('client', function(client) {
    client.on('close', function() {
      delete clients[client.id];
    });
    client.channel.on('derby:app', function(data, cb) {
      if (data.name !== app.name) return;
      if (data.hash !== app.scriptHash) return cb('hash mismatch');
      clients[client.id] = client;
      cb();
    });
  });
};

App.prototype._refreshClients = function() {
  if (!this.clients) return;
  var data = this.views.serialize({minify: true});
  for (var id in this.clients) {
    this.clients[id].channel.send('derby:refreshViews', data);
  }
};
