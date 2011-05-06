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

var SERVICE = "log_serv";


exports.start = function(verbose) {
  var me = self();
  var ref;

  if (whereis(SERVICE)) {
    throw new Error(SERVICE + " already started");
  }

  spawn(function() {
    ref = spawn(logserv, [verbose]);
    send(ref, ["ping", self()]);
    receive();
    send(me, ["ok"]);
  });

  receive();

  return ref;
};



exports.getLog = function(name) {
  name = name ? name + ": " : null;
  return function() {
    var args;
    var msg;

    if (name) {
      args = Array.prototype.slice.call(arguments, 1);
      msg = ["log", name + arguments[0]].concat(args);
    } else {
      msg = arguments;
    }

    return send(SERVICE, msg);
  }
};



//
// Entrypoint for `log_serv` nodule
//
function logserv(verbose) {
  var running = true;

  register(SERVICE, self());

console.log("log service start");
  send(SERVICE, ["log", SERVICE + ": started"]);

  while (running) {
    receive (
      function ping(from) {
        send(from, ["pong"]);
      },

      function log() {
        console.log.apply(null, arguments);
      },

      function error() {
        console.error.apply(null, arguments);
      },

      function stop() {
        running = false;
        console.log("%s: shutdown", SERVICE);
      },
      
      function () {
        console.log(arguments);
      }
    );
  }
}
