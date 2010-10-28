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
const parseDynamics         = require("./chaining").parseDynamics

const FORMAT_RE = /%[sdj]/g;

exports.tryBind = function(channel, host, portsExpr, callback) {
  var url = null
  var ports = null;
  var index = 0;
  
  function oncallback(error, url) {
    if (url) {
      callback(null, url);
    } else {
      trynext();
    }
  }
  
  function trynext() {
    var port = ports.shift();
    var url = url = "tcp://" + host + ":" + port;
    
    if (!port) {
      callback("no free ports");
      return;
    }
    
    channel.bind(url, oncallback);
  }

  ports = (function (from, to) {
    var result = [];
    for (var i = parseInt(from); i < parseInt(to) + 1; i++) {
      result.push(i);
    }
    return result;
  }).apply(null, portsExpr.split("-"));

  trynext();
}

/**
 *  ## mcall(target, member, ...) **chainable**
 *
 *  Call specified `'member´' on provided ´'object'´.
 */
exports.mcall = function() {
  var graph = Array.prototype.slice.call(arguments);
  var target = graph.shift();
  var member = graph.shift();
  
  return function(inargs) {
    var args = parseDynamics(inargs, graph);
    target[member].apply(target, args);
    return inargs;
  }
}

/**
 *  ## format(string, ...) **chainable**
 *
 *  Format text
 */
exports.format = function() {
  var graph = Array.prototype.slice.call(arguments);
  var str = graph.shift();
  
  return function(inargs) {
    var args = parseDynamics(inargs, graph);
    var i = 1;
    var result = String(str).replace(FORMAT_RE, function (x) {
      switch (x) {
        case '%s': return args[i++];
        case '%d': return +args[i++];
        case '%j': return JSON.stringify(args[i++]);
        default:
          return x;
       }
    });
    for (var len = args.length; i < len; ++i) {
       result += ' ' + args[i];
    }
    process.stdout.write(result + '\n');
    return inargs;
  }
} 
 