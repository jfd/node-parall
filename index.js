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
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
//  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
//  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//

var slice = Array.prototype.slice;

// Messaging functions
exports.createChannel = require("./lib/channel").createChannel;
exports.createSocket = require("./lib/socket").createSocket;

// Worker functions
exports.spawn         = require("./lib/worker").spawn;

Object.defineProperty(exports, 'isWorker', {
  get: function() {
    return require("./lib/worker").isWorker;
  }
});

Object.defineProperty(exports, 'stdmsg', {
  get: function() {
    return require("./lib/util").openStdMsg();
  }
});

Object.defineProperty(exports, 'getProcessUrl', {
  get: function() {
    return require("./lib/util").getProcessUrl;
  }
});

// Utils functions
exports.geturi        = require("./lib/util").geturi;