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

var ContextRef              = require("./kernel").ContextRef
  , NoduleRef               = require("./kernel").NoduleRef
  , ExitSig                 = require("./kernel").ExitSig
  , getRunningNoduleCtx     = require("./kernel").getRunningNoduleCtx
  , getContextByRef         = require("./kernel").getContextByRef
  , registerNamedContext    = require("./kernel").registerNamedContext
  , unregisterNamedContext  = require("./kernel").unregisterNamedContext
  , getNamedContext         = require("./kernel").getNamedContext
  , getNamedContextNames    = require("./kernel").getNamedContextNames;



var NOMATCH = {};



//
//  ### function node([nodule]) **exported**
//
//  See `api.md` for documentation and usage.
//
exports.node = function(nodule) {
  nodule = nodule || exports.self();
  return nodule ? nodule.node : null;
};



//
//  ### function self() **exported**
//
//  See `api.md` for documentation and usage.
//
exports.self = function() {
  var ctx;
  return (ctx = getRunningNoduleCtx()) && ctx.ref || null;
};



//
//  ### function isnodule() **exported**
//
//  See `api.md` for documentation and usage.
//
exports.isnodule = function() {
  return getRunningNoduleCtx() ? true : false;
};



//
//  ### function registerImpl(regname, ref) **exported**
//
//  See `BIF/register` in `api.md` for documentation and usage.
//
exports.register = function(regname, ref) {
  var ctx;

  if (!(ref instanceof NoduleRef)) {
    return false;
  }

  if (!(ctx = getContextByRef(ref))) {
    return false;
  }

  return registerNamedContext(regname, ctx);
};



//
//  ### function unregisterImpl(regname) **exported**
//
//  See `BIF/unregister` in `api.md` for documentation and usage.
//
exports.unregister = function(regname) {
  return unregisterNamedContext(regname);
};



//
//  ### function whereisImpl(name) **exported**
//
//  See `BIF/whereis` in `api.md` for documentation and usage.
//
var whereis = exports.whereis = function(regname) {
  var ctx = getNamedContext(regname);
  return ctx && ctx.ref || null;
};



//
//  ### function registered() **exported**
//
//  See `BIF/registered` in `api.md` for documentation and usage.
//
exports.registered = function() {
  return getNamedContextNames();
};



//
//  ### function receive(callbacks) **exported**
//
//  See `BIF/receive` in `api.md` for documentation and usage.
//
exports.receive = function() {
  var ctx;
  var msg;
  var match;
  var result;
  var fn;

  if (!(ctx = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  if (arguments.length) {
    match = collectPatterns(arguments);
    msg = ctx.waitForMessage();

    if ((fn = match[msg[0]])) {
      if ((result = fn.apply(null, msg.slice(1))) == NOMATCH &&
          (fn = match[""])) {
        fn(msg);
      }
    } else if ((fn = match[""])) {
      fn.apply(null, msg);
    }
  } else {
    return ctx.waitForMessage();
  }
};


function collectPatterns(args) {
  var patterns = {};
  var name;
  var fn;
  var pattern;

  for (var i = 0, l = args.length; i < l; i++) {
    fn = args[i];
    name = fn.name;
    if ((pattern = patterns[name])) {
      pattern[fn.length] = fn;
    } else {
      patterns[name] = pattern = buildMatch();
      pattern[fn.length] = fn;
    }
  }

  return patterns;
}

function buildMatch() {
  var count;
  var self = function() {
    var fn;
    if (!(fn = self[arguments.length])) {
      count = self.length;
      while (!(fn = self[count--]) && count > -1) { }
      if (!fn) return NOMATCH;
    }
    return fn.apply(self, arguments);
  };
  return self;
};

//
//  ### function send(dest, msg) **built-in function**
//
//  See `api.md` for documentation and usage.
//
exports.send = function(dest, msg) {
  var sender;
  var destination;
  var sender;

  if (dest === null) {
    return true;
  }

  if (typeof dest === "string") {
    dest = whereis(dest);
  }

  if (!(dest instanceof ContextRef)) {
    throw new Error("Bad argument, invalid `dest`");
  }

  if (!(Array.isArray(msg))) {
    throw new Error("Bad argument, expected `message` as `Array`");
  }

  if (typeof dest == "string") {
    dest = whereis(dest);
  }

  if (!(destination = getContextByRef(dest))) {
    return false;
  }

  if (!(sender = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  return destination.post(msg);
};



//
//  ### function exit(reason, [nodule]) **built-in function**
//
//  See `api.md` for documentation and usage.
//
exports.exit = function(reason, nodule) {
  var sender;
  var dest;
  var sig;

  if (typeof reason !== "string") {
    throw new Error("Argument `reason` must be of type String");
  }

  if (!(sender = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  sig = new ExitSig(sender.ref, reason);

  if (nodule) {
    if (typeof nodule === "string") {
      nodule = whereis(nodule);
      console.log(nodule);
    }
    if (nodule instanceof NoduleRef && (dest = getContextByRef(nodule))) {
      dest.post(sig);
    } else {
      return false;
    }
  } else {
    sender.post(sig);
  }
};



//
//  ### function link(nodule)  **built-in function**
//
//  See `api.md` for documentation and usage.
//
exports.link = function(nodule) {
  var sender;
  var dest;

  if (!(sender = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  if (typeof nodule == "string") {
    nodule = whereis(nodule);
  }

  if (sender.ref == nodule) {
    return false;
  }

  if (!(nodule instanceof NoduleRef) || !(dest = getContextByRef(nodule))) {
    sender.post(new ExitSig(nodule, "noproc"));
    return;
  }

  return sender.link(dest);
};



//
//  ### function unlink(nodule)  **built-in function**
//
//  See `api.md` for documentation and usage.
//
exports.unlink = function(nodule) {
  var sender;
  var dest;

  if (!(sender = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  if (typeof nodule == "string") {
    nodule = whereis(nodule);
  }

  if (sender.ref == nodule) {
    return false;
  }

  if (!(nodule instanceof NoduleRef) || !(dest = getContextByRef(ref))) {
    return false;
  }

  return sender.unlink(dest);
};

