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

/** exported functions from kernel module **/
exports.startTimer      = require("./kernel").startTimer;
exports.cancelTimer     = require("./kernel").cancelTimer;

/** built-in functions from kernel module **/
exports.self            = require("./kernel").send;
exports.node            = require("./kernel").node;
exports.link            = require("./kernel").link;
exports.unlink          = require("./kernel").unlink;
exports.send            = require("./kernel").send;
exports.receive         = require("./kernel").receive;
exports.exit            = require("./kernel").exit;
exports.register        = require("./kernel").register;
exports.unregister      = require("./kernel").unregister;
exports.whereis         = require("./kernel").whereis;
exports.registered      = require("./kernel").registered;


//
//  ### function sendAfter(dest, msg, delay) 
//
//
exports.sendAfter = function sendAfter(dest, msg, delay) {
  return exports.startTimer(delay, dest, msg);
};

// Object.defineProperty(exports, 'spawn', {
//   get: function() {
//     return require("./lib/core").spawn;
//   }
// });