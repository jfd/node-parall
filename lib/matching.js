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
    , ChainBuilder  = require("./chaining").ChainBuilder

const EXPR_RE       = /^\+/


exports.match = function() {
  var args = Array.prototype.slice.call(arguments);
  return exports.Matcher(null, args);
}

exports.mmatch = function() {
  var args = Array.prototype.slice.call(arguments);
  var msg = args.shift();
  return exports.Matcher(msg, args);
}

exports.Matcher = function(context, args) {
  var argslength = args.length;
  var index = 0;
  var row = 0;
  var patterns = [[]];
  var callbacks = [];
  var script = null;
  var arg = null;
  var type = null;
  
  for (;index < argslength; index++) {
    arg = args[index];
    type = getExprType(arg);
    switch (type) {
      
      case "CHAIN_BUILDER":
        if (patterns[row].length) {
          throw new Error("Parse error");
        }
        patterns[row] = arg.patterns;
        callbacks[row] = arg.bindExecute();
        patterns[++row] = [];
        break;
      
      case "function":
        if (!patterns[row].length) {
          throw new Error("Parse error - Expected pattern before 'callback'");
        }
        callbacks[row] = arg;
        patterns[++row] = [];
        break;

      default:
        patterns[row].push(arg);
        break;
    }
  }
  
  script = exports.compile(patterns);
  script.runInThisContext();
  
  return function() {
    var matchargs = Array.prototype.slice.call(arguments);
    var captures = [];
    var callback;
    var callbackIndex;
    
    matchargs.unshift(captures);
    
    callbackIndex = match.apply(null, matchargs);
    
    if (callbackIndex) {
      callback = callbacks[callbackIndex - 1];
      callback.apply(context, captures);
      return true;
    } else {
      return false;
    }
  }  
}

//
//  ### matching.compile(patterns, format='script')
//  
//  Compiles ´patterns´ into specified format. Available 
//  formats are ´script´ and ´source´.
//
exports.compile = function(patterns, format) {
  var pattern = null;
  var patternresult = null;
  var src = ["function match("];
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
  , defs.join(";")
  , ";return ", match.join("||")
  , "}"
  );

  return (format == "source" && src.join("")) || new Script(src.join(""));
}

exports.when = function() {
  var patterns = Array.prototype.slice.call(arguments);
  var chainbuilder = new ChainBuilder({patterns: patterns});
  
  return chainbuilder.bindAdd();
}

function buildPatternArg(pattern, index, cache) {
  var expr = null;
  var plength = pattern.length;
  var matches = [];
  var defs = [];
  var assigns = [];
  var type = null;
  
  for (var i = 0, l = pattern.length; i < l; i++) {
    expr = pattern[i];
    buildPattern(matches, defs, assigns, expr, "$A" + i, cache);
  }
  
  return {
    defs: defs && defs.join(";"),
    match: "((" + matches.join("&&") + 
           ((assigns.length && "&&" + assigns.join("&&")) || "") +
           ")&&" + index + ")"
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
        d.push("var " + isname + "=Array.isArray(" + name + ")");
      }
      argm = [];
      for (var i=0, l=expr.length; i<l; i++) {
        argname = name + "A" + i;
        if (!cache[argname]) {
          cache[argname] = true;
          d.push("var " + argname +"=" + isname + "&&" + name + "[" + i + "]");
        }d
        buildPattern(argm, d, a, expr[i], argname, cache);
      }
      m.push(isname + "&&" + argm.join("&&"));
      break;
      
    case "OBJECT":
      isname = "_" + name;
      if (!cache[isname + "o"]) {
        cache[isname + "o"] = true;
        d.push("var " + isname + "=typeof(" + name + ")!=='undefined'&&"
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
          d.push("var " + argname + "=" + isname + "&&" + name + "['" + k + "']");
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
  } else if(typeof(expr) == "function") {
    return "function";
  } else if(expr.constructor == ChainBuilder) {
    return "CHAIN_BUILDER";
  } else {
    return "OBJECT";
  }
}