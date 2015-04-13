var Page = require('./Page');
var util = require('racer/lib/util');
var contexts = require('derby-templates').contexts;

Page.prototype.render = function(status, ns) {
  if (typeof status !== 'number') {
    ns = status;
    status = null;
  }
  this.app.emit('render', this);

  if (status) {
    this.res.statusCode = status;
  }

  var page = this;
  page._setRenderParams(ns);

  var appScript = '<script async src="' + page.app.scriptUrl + '"></script>';
  if (process.env.DERBY_FLEXIBLE_PAGE_RENDER) {
    if (!page.app.views.nameMap.AppScript) {
      page.app.views.register('AppScript', appScript, {serverOnly: true});
      page.res.content = page.get('Page', ns);
    }
  }
  else {
    var pageHtml = page.get('Page', ns);
    page.res.content = pageHtml + appScript;
  }

  this.model.destroy('$components');
  this.model.bundle(function(err, bundle) {
    if (err) {
      return page.emit('error', err);
    }

    var derbyBundle = stringifyBundle(bundle);
    //in order we'd like to substitute model
    if (page.derbyBundle) derbyBundle = page.derbyBundle(derbyBundle);
    else derbyBundle = '<script type="application/json" id="derby-bundle">' + derbyBundle + '</script>';

    if (process.env.DERBY_FLEXIBLE_PAGE_RENDER) {
      page.res.content = page.res.content.replace('__DERBY_BUNDLE__', derbyBundle);
    }
    else {
      page.res.content += derbyBundle + page.get('Tail', ns);
    }

    if (page.res.send) {
      // Prevent the browser from storing the HTML response in its back cache, since
      // that will cause it to render with the data from the initial load first
      page.res.setHeader('Cache-Control', 'no-store');
      page.res.send(page.res.content);
    }

    page.app.emit('routeDone', page, 'render');
  });
};

Page.prototype.renderStatic = function(status, ns) {
  if (typeof status !== 'number') {
    ns = status;
    status = null;
  }
  this.app.emit('renderStatic', this);

  if (status) {
    this.res.statusCode = status;
  }
  this.params = pageParams(this.req);
  this._setRenderParams(ns);
  var pageHtml = this.get('Page', ns);
  var tailHtml = this.get('Tail', ns);
  if (this.res.send) {
    this.res.send(pageHtml + tailHtml);
  } else {
    this.res.content = pageHtml + tailHtml;
  }
  this.app.emit('routeDone', this, 'renderStatic');
};

/**
 * @param {number|string} [status]
 * @param {string} [ns]
 * @returns {string}
 */
Page.prototype.renderString = function(status, ns) {
  this.render(status, ns);
  return this.res.content;
};

// Don't register any listeners on the server
Page.prototype._addListeners = function() {};

function stringifyBundle(bundle) {
  // Pretty the output in development
  var json = (util.isProduction) ?
    JSON.stringify(bundle) :
    JSON.stringify(bundle, null, 2);
  return json && json.replace(/<\//g, '<\\/');
}

// TODO: Cleanup; copied from tracks
function pageParams(req) {
  var params = {
    url: req.url, body: req.body, query: req.query
  };
  for (var key in req.params) {
    params[key] = req.params[key];
  }
  return params;
}
