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


// Messaging functions
exports.createChannel = require("./messaging").createChannel;
exports.send          = require("./messaging").send;
exports.reject        = require("./messaging").reject;
exports.mmatch        = require("./messaging").mmatch;
exports.release       = require("./messaging").release;
exports.Fd            = require("./messaging").Fd;

// Worker functions
exports.spawn         = require("./worker").spawn;

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
exports.tryBind       = require("./utils").tryBind;
exports.mcall         = require("./utils").mcall;
exports.format        = require("./utils").format;

// Encoding functions
exports.encode        = require("./encoding").encode;
exports.decode        = require("./encoding").decode;