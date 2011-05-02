/*jshint loopfunc: true, laxbreak: true, expr: true */

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
  , getRunningNoduleCtx     = require("./kernel").getRunningNoduleCtx
  , getNamedContext         = require("./kernel").getNamedContext;

/** built-in functions from kernel module **/
exports.kernel          = require("./kernel").kernel;
exports.link            = require("./kernel").linkImpl;
exports.unlink          = require("./kernel").unlinkImpl;
exports.send            = require("./kernel").sendImpl;
exports.receive         = require("./kernel").receiveImpl;
exports.exit            = require("./kernel").exitImpl;
exports.starTimer       = require("./kernel").starTimer;
exports.cancelTimer     = require("./kernel").cancelTimer;



//
//  ### function startTimer(delay, dest, msg) **exported**
//
//  See `api.md` for documentation and usage.
//
exports.startTimer = function(delay, dest, msg) {
  var ctx;

  if (dest === null) {
    return true;
  }

  if (!(dest instanceof ContextRef)) {
    throw new Error("Invalid `ref`");
  }

  if (!(Array.isArray(msg))) {
    throw new Error("Expected `message` as `Array`");
  }

  if (!(ctx = getRunningNoduleCtx())) {
    throw new Error("`startTimer` works only from within a running Nodule.");
  }

  return ctx.startTimer(delay, dest, msg);
};



//
//  ### function cancelTimer(timerid) **exported**
//
//  See `api.md` for documentation and usage.
//
exports.cancelTimer = function(timerid) {
  var ctx;

  if (!(ctx = getRunningNoduleCtx())) {
    throw new Error("called outside nodule");
  }

  return ctx.cancelTimer(timerid);
};



//
//  ### function sendAfter(dest, msg, delay) 
//
//
exports.sendAfter = function sendAfter(dest, msg, delay) {
  var ctx;

  if (typeof dest == "string") {
    ctx = getNamedContext(dest);
    dest = ctx && ctx.ref || null;
  }

  return exports.startTimer(delay, dest, msg);
};

// Object.defineProperty(exports, 'spawn', {
//   get: function() {
//     return require("./lib/core").spawn;
//   }
// });