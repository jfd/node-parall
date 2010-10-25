/** 
 *        Copyright 2010 Johan Dahlberg. All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without 
 *  modification, are permitted provided that the following conditions 
 *  are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, 
 *       this list of conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright 
 *       notice, this list of conditions and the following disclaimer in the 
 *       documentation and/or other materials provided with the distribution.
 *
 *  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, 
 *  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY 
 *  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL 
 *  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
 *  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
 *  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, 
 *  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

const EventEmitter  = require("events").EventEmitter
    , Script        = process.binding('evals').Script
    , Chain         = require("./chaining").Chain
    , createChain   = require("./chaining").createChain
    , createDynamic = require("./chaining").createDynamic

const EXPR_RE       = /^\+/


exports.match = function() {
  var args = Array.prototype.slice.call(arguments);
  return exports.Matcher(args);
}

exports.mmatch = function() {
  var args = Array.prototype.slice.call(arguments);
  var options = {
    prematch: function(args, out) {
      out.context = args.shift();
      return out.context;
    }
  }
  return exports.Matcher(args, options);
}

exports.Matcher = function(args, options) {
  var argslength = args.length;
  var sandbox = {};
  var index = 0;
  var row = 0;
  var script = null;
  var arg = null;
  var type = null;
  var patterns = [[]];
  var matchCallbacks = [];
  var matchCallbackTypes = [];
  var initCallbacks;
  var prematchCallbacks;
  var postmatchCallbacks;
  
  if (options) {
    options.init && (initCallbacks = [options]);
    options.prematch && (prematchCallbacks = [options]);
    options.postmatch && (postmatchCallbacks = [options]);
  }
  
  for (;index < argslength; index++) {
    arg = args[index];
    type = getExprType(arg);

    switch (type) {
      
      case "CHAIN":
        if (patterns[row].length) {
          throw new Error("Parse error - Expected ´function´ or ´pattern´");
        }
        
        if (arg.patterns) {
          if (!arg.match) {
            throw new Error("Expected ´match´ method in Chain instance");
          }
          patterns[row] = arg.patterns;
          matchCallbacks[row] = arg;
          patterns[++row] = [];
        }

        arg.init && (
          initCallbacks && initCallbacks.push(arg) ||
          (initCallbacks = [arg]));

        arg.prematch && (
          prematchCallbacks && prematchCallbacks.push(arg) ||
          (prematchCallbacks = [arg]));

        arg.postmatch && (
          postmatchCallbacks && postmatchCallbacks.push(arg) ||
          (postmatchCallbacks = [arg]));
        break;
      
      case "function":
        if (!patterns[row].length) {
          throw new Error("Parse error - Expected pattern before 'callback'");
        }
        
        matchCallbacks[row] = arg;
        patterns[++row] = [];
        break;

      default:
        patterns[row].push(arg);
        break;
    }
  }
  
  script = exports.compile(patterns);
  script.runInNewContext(sandbox);
  
  function result() {
    var matchargs = Array.prototype.slice.call(arguments);
    var out = { context: null };
    var captures = [];
    var callback;
    var obj;
    var index;
    var i;
    var l;
    
    if (prematchCallbacks) {
      for(i = 0, l = prematchCallbacks.length; i < l; i++) {
        obj = prematchCallbacks[i];
        matchargs = obj.prematch.call(obj, matchargs, out);
      }
    }

    matchargs.unshift(captures);
    index = sandbox.run.apply(null, matchargs) - 1;

    if (index > -1) {

      if (postmatchCallbacks) {
        for(i = 0, l = postmatchCallbacks.length; i < l; i++) {
          obj = postmatchCallbacks[i];
          index = obj.postmatch.call(obj, index, matchCallbacks);
        }
      }
      
      callback = matchCallbacks[index];

      if (typeof callback == 'function') {
        callback.apply(out.context, captures);
      } else {
        callback.match.call(callback, out.context, captures);
      }
      
      return true;
    } else {
      return false;
    }
  }
  
  if (initCallbacks) {
    result._init = function(ctx) {
      for(var i = 0, l = initCallbacks.length; i < l; i++) {
        obj = initCallbacks[i];
        obj.init.call(obj, ctx);
      }
    }
  }
  
  return result;  
}

/**
 *  ### matching.compile(patterns, format='script')
 *  
 *  Compiles ´patterns´ into specified format. Available 
 *  formats are ´script´ and ´source´.
 *
 */
exports.compile = function(patterns, format) {
  var pattern = null;
  var patternresult = null;
  var src = ["this.run=function("];
  var defs = [];
  var fnargs = [];
  var match = [];
  var maxargs = 0;
  var cache = {};
  
  for (var pi = 1, pl = patterns.length; pi <= pl; pi++) {
    pattern = patterns[pi - 1];
    if (pattern.length) {
      maxargs = Math.max(pattern.length, maxargs);
      patternresult = buildPatternArg(pattern, pi, cache);
      patternresult.defs && defs.push(patternresult.defs);
      match.push(patternresult.match);
    }
  }
  
  // Result arg
  fnargs.push("$R");

  for (var iarg=0; iarg < maxargs; iarg++) {
    fnargs.push("$A" + iarg);
  }

  src.push(fnargs.join(","), "){"
  , (defs.length && "var " + defs.join(",")) || ""
  , ";return ", match.join("||")
  , "}"
  );

  return (format == "source" && src.join("")) || new Script(src.join(""));
}

/**
 *  ### matching.when(...) - CHAIN
 *
 *  Executes chained functions when pattern criteria is met.
 *
 *  Example:
 *    
 *    match (
 *      when ("hello-world") (
 *        // Add chained functions here
 *      )
 *    )
 *  
 */
exports.when = function() {
  var patterns = Array.prototype.slice.call(arguments);
  return createChain(function() {
    this.patterns = patterns;
    this.match = this.runInNewContext;
    return this;
  });
}

exports._ = function() {
  return "_";
}

/**
 *  ### matching.after(msecs)
 *
 *  
 */
exports.after = function(msecs) {
  return createChain(function() {
    var handle;
    
    this.init = function(ctx) {
      clearTimeout(handle);
      handle = setTimeout(this.runInNewContext.bind(this, [ctx]), msecs);
    }
    
    this.postmatch = function(index) {
      clearTimeout(handle);
      return index;
    }
    
    handle = setTimeout(this.runInNewContext.bind(this), msecs);
    
    return this;
  }); 
}

/**
 *  ### matching.$([index], [type], [defaultValue]) **dynamic**
 *
 *  Return `index` in `the underlying `ctx`. 
 *
 *  Example with type:
 *
 *    // Takes the first argument of type String
 *    send($(String));
 *
 *  Example with numbered type:
 *
 *    // Takes the second argument of type String
 *    send($(1, String));
 */
exports.$ = function() {
  var args = Array.prototype.slice.call(arguments);
  var targetindex = typeof args[0] == "number" ? args.shift() : 0;
  var type = typeof args[0] == "function" ? getExprType(args.shift()) : null;
  var def = (args.length && args[0]) || undefined;
  
  if (type) {
    return createDynamic(function() {
      var index = this.length;
      for (var i = 0, l < this.length; i++) {
        if (matchExprType(type, this[i])) {
          if (index++ == targetindex) {
            return this[i];
          }
        }
      }
      return def;
    });
  } else {
    return createDynamic(function() {
      if (index >= this.length) {
        return def;
      }
      return this[targetindex];
    });
  }
}

function buildPatternArg(pattern, index, cache) {
  var expr = null;
  var plength = pattern.length;
  var matches = [];
  var defs = [];
  var assigns = [];
  var type = null;
  var match = [];
  
  for (var i = 0, l = pattern.length; i < l; i++) {
    expr = pattern[i];
    buildPattern(matches, defs, assigns, expr, "$A" + i, cache);
  }
  
  if (!matches.length && !assigns.length) {
    match.push("(" + index + ")");
  } else {
    match.push("((");
    matches.length && match.push(matches.join("&&"));
    matches.length && assigns.length && match.push("&&");
    assigns.length && match.push(assigns.join("&&"));
    match.push(")&&" + index + ")");
  }
  
  return {
    defs: defs && defs.join(","),
    match: match.join("")
  } 
}

function buildPattern(m, d, a, expr, name, cache) {
  var type = null;
  var isname = null;
  var argm = null;
  var argname = null;
  var keys = null;
  var k = null;
  var klength = null;
  
  switch (type = getExprType(expr)) {
    
    case "undefined":
    case "null":
      m.push(name + "===" + type);
      break;

    case "WILDCARD":
      break;
      
    case "STRING":
      m.push(name + "==='" + expr + "'");  
      break;
      
    case "NUMBER":
      m.push(name + "===" + expr);
      break;
      
    case "ARRAY":
      isname = "_" + name;
      if (!cache[isname + "a"]) {
        cache[isname + "a"] = true;
        d.push(isname + "=Array.isArray(" + name + ")");
      }
      argm = [];
      for (var i=0, l=expr.length; i<l; i++) {
        argname = name + "A" + i;
        if (!cache[argname]) {
          cache[argname] = true;
          d.push(argname +"=" + isname + "&&" + name + "[" + i + "]");
        }d
        buildPattern(argm, d, a, expr[i], argname, cache);
      }
      m.push(isname + "&&" + argm.join("&&"));
      break;
      
    case "OBJECT":
      isname = "_" + name;
      if (!cache[isname + "o"]) {
        cache[isname + "o"] = true;
        d.push(isname + "=typeof(" + name + ")!=='undefined'&&"
        + name + "!==null"
        );
      }
      argm = [];
      keys = Object.keys(expr);
      klength = keys.length;
      for (var i=0; i<klength; i++) {
        k = keys[i];
        argname = name + "M" + k;
        if (!cache[argname]) {
          cache[argname] = true;
          d.push(argname + "=" + isname + "&&" + name + "['" + k + "']");
        }
        buildPattern(argm, d, a, expr[k], argname, cache);
      }
      m.push(isname + "&&" + argm.join("&&"));
      break;
    
    case "array":
      m.push("Array.isArray(" + name + ")");
      a.push("$R.push(" + name + ")");
      break;
    
    case "number":
    case "string":
    case "object":
      m.push("typeof(" + name + ")==='" + type + "'");
      a.push("$R.push(" + name + ")");
      break;
      
    case "expr":
    
      break;
  }
}

function getExprType(expr) {
  if (expr === undefined) {
    return "undefined";
  } else if (expr === null) {
    return "null";
  } else if (typeof expr == "string") {
    return (EXPR_RE(expr) && "expr") || "STRING";
  } else if (typeof(expr) == "number") {
    return "NUMBER";
  } else if (Array.isArray(expr)) {
    return "ARRAY";
  } else if (expr === Array) {
    return "array";
  } else if (expr === Number) {
    return "number";
  } else if (expr === String) {
    return "string";
  } else if (expr === Object) {
    return "object";
  } else if (typeof(expr) == "function") {
    return "function";
  } else if (expr instanceof Chain) {
    return "CHAIN";
  } else if (expr == exports._) {
    return "WILDCARD";
  } else {
    return "OBJECT";
  }
}

function matchExprType(type, instance) {
  switch (type) {
    case "string": return typeof instance == "string";
    case "number": return typeof instance == "number";
    case "array": return Array.isArray(instance);
    case "object": return typeof instance == "object";
  }
  return undefined;
}