// 
//        Copyright 2010 Johan Dahlberg. All rights reserved.
//
//  Redistribution and use in source and binary forms, with or without 
//  modification, are permitted provided that the following conditions 
//  are met:
//
//    1. Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//
//    2. Redistributions in binary form must reproduce the above copyright 
//       notice, this list of conditions and the following disclaimer in the 
//       documentation and/or other materials provided with the distribution.
//
//  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, 
//  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY 
//  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL 
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, 
//  INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
//  NOT LIMITED, TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
//  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
//  THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
//  (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
//  THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//


//
//  Extends `"target"` with `"prop"` which can be used to
//  define overload-patterns. 
//
exports.overload = function(target, prop) {
  var methods = [];

  function dispatcher() {
    var method = methods[arguments.length];
    if (method) {
      return method.apply(dispatcher, arguments);
    } else {
      throw new Error( "unknown function `" +
                       prop + "/" + arguments.length +
                       "´");
    }
  }

  Object.defineProperty(target, prop, {
    enumerable: true,
    get: function() { return dispatcher; },
    set: function(fn) {
      if (typeof fn !== "function") {
        throw new Error("expected `fn` as Function");
      }
    	methods[fn.length] = fn; 
    }
  });
};


/**
 *  ### getarg(expr, defaultValue)
 *
 *  Get argument, based on index, from ´argv´. The optional 
 *  `'defaultValue'' is return if option expression wasn't found.
 *
 *  Example:
 *
 *      var port = getarg(0, "myconfig.conf");
 *  
 */
exports.getarg = function(index, defaultValue) {
  var tindex = typeof index == "number" ? index : null;
  var defval = tindex == null ? [] : defaultValue;
  var args = process.argv;
  var count = 0;
  var arg;

  for (var i = 0, l = args.length; i < l; i++) {
    arg = args[i];
    if (arg[0] != "-") {
      if (tindex === null) {
        defval.push(arg);
      } else {
        if (count == targetindex) {
          return arg;
        }
        count++;
      }
    }
  }

  return defval;
};

//
//  ### util.getopt(expr, defaultValue)
//
//   Get option, based on expression, from ´argv´. The optional 
//  `'defaultValue'' is return if option expression wasn't found.
//
//  Example:
//
//      var port = getopt("--port", 7120);
// 
//
exports.getopt = function(expr, defaultValue) {
	var args = process.argv;
	var arg = null;
	var index = args.length;
	var argType;
	var argValue;
	var regexp;
	var m;

	regexp = new RegExp("^(" + expr + ")(?:=(.+))|(" + expr + ")");

	while (index--) {
		arg = args[index];
		m = regexp(arg);

		if (m) {
      if (m[1]) {
        return m[2];
      } else if (m[3]) {
        return true;
      }
    }
	}

	if (arguments.length == 1) {
    throw new Error("Expected option " + expr);
	} else {
	  return defaultValue;
	}
};

//
//  ### util.hasopt(expr)
// 
//  Returns ´true´ if process.argv contains the specified 
//  option expression, else `false´.
//
exports.hasopt = function(expr) {
	var opts = expr.split(" ");
	var index = opts.length;
	var index2 = null;
  var regexp;

	while (index--) {
		for (index2 = process.argv.length; index2--;) {
      regexp = new RegExp("^(" + opts[index] + ")");
			if (regexp(process.argv[index2])) {
				return true;
			}
		}
	}

	return false;
};