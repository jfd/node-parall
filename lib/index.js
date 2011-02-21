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
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
//  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
//  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

const slice = Array.prototype.slice;


var receiveChannel;

// Messaging functions
exports.createChannel = require("./channel").createChannel;
exports.createSocket = require("./socket").createSocket;

// Worker functions
exports.spawn         = require("./worker").spawn;

Object.defineProperty(exports, 'isWorker', {
  get: function() {
    return require("./worker").isWorker;
  }
});


exports.receive = function() {
  var args = slice.call(arguments);
  var options = {
    prematch: function(args, out) {
      out.context = args.shift();
      return out.context.graph;
    }
  }

  if (process.stdchannel) {
    process.stdchannel.on("message", 
      require("./matching").Matcher(args, options));
  } else {
    throw new Error("Cannot `receive`, stdchannel is not initialized.");
  }
}

exports.mmatch = function() {
  var args = slice.call(arguments);
  var options = {
    prematch: function(args, out) {
      out.context = args.shift();
      return "graph" in out.context && out.context.graph || args;
    }
  }
  
  return require("./matching").Matcher(args, options);
}

// Matching functions
exports.match         = require("./matching").match;
exports.when          = require("./matching").when;
exports.after         = require("./matching").after;
exports._             = require("./matching")._;
exports.$             = require("./matching").$;

// Chaining
exports.createChain   = require("./chaining").createChain;
exports.createDynamic = require("./chaining").createDynamic;
exports.isDyanmic     = require("./chaining").isDyanmic;
exports.parseDynamics = require("./chaining").parseDynamics;

// Utils functions
exports.mcall         = require("./utils").mcall;
exports.fcall         = require("./utils").fcall;
exports.format        = require("./utils").format;
exports.pass          = require("./utils").pass;
exports.geturi        = require("./utils").geturi;