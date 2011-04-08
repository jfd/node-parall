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

var spawn                 = require("child_process").spawn
  , extname               = require("path").extname
  , inherits              = require("util").inherits
  , slice                 = Array.prototype.slice;

var ReqSocket             = require("./req").ReqSocket;

var resolveRelativePath   = require("./util").resolveRelativePath;

var SPAWN_OPTIONS_RE      = /^(join|pipe|noerror|keepalive|deamon|debug)$/i;
var IS_URI_RE             = /^(mem:|tcp:|proc:|sock:)\/\//i;

exports.spawn = function() {
  var args = slice.call(arguments);
  var path = args.shift();
  var options = {};
  var worker;
  var workerargs;

  // Parse options from arguments
  args.forEach(function(arg) {
    var name;

    if (Array.isArray(arg)) {
        workerargs = workerargs && workerargs.concat(arg) || arg.slice(0);
    } else if (typeof arg == "string") {

      name = arg.toString().toLowerCase() || "<unknown>";

      if (SPAWN_OPTIONS_RE.test(name)) {
        options[name] = true;
      } else if(IS_URI_RE.test(name)) {
        options.entryUri = name;
      } else {
        throw new Error("Bad option: `" + name + "`");
      }
    } else if (arg) {
      for (var key in arg) {
        options[key] = arg[key];
      }
    }
  });

  worker = new Worker(path, options, workerargs);
  startWorker(worker);

  return worker;
};

exports.isWorker = function() {
  return (parseInt(process.env.PARALL_MAIN_PROCESS, 10) > 0);
};

function Worker(module, options, args) {
  ReqSocket.call(this);

  this.stdin = null;
  this.stdout = null;
  this.stderr = null;
  this.pid = null;

  this._module = module;
  this._options = options;
  this._args = args;
  this._killsig = undefined;
}

exports.Worker = Worker;
inherits(Worker, ReqSocket);

Worker.prototype.kill = null;

Worker.prototype._send = ReqSocket.prototype.send;
Worker.prototype.send = function() {

  if (!this.writable && !this._connecting) {
    this.connect();
  }

  return this._send.apply(this, arguments);
};

Worker.prototype._connect = ReqSocket.prototype.connect;
Worker.prototype.connect = function() {
  var url = typeof arguments[0] == "string" ? arguments[0] : null;
  var callback = arguments[arguments.length - 1];

  if (!url) {
    url = require("./util").getProcessUrl(this.pid);
  }

  this._connect(url);
};

// Start the process
function startWorker(self) {
  var modulepath = resolveRelativePath(self._module);
  var options = self._options;
  var env = options.env || process.env;
  var spawnopts = {};
  var mainpid;
  var execpath;
  var child;
  var childargs;
  var stderrbuff;
  var stdoutbuff;
  var onprocessexit;
  var puri;

  if (typeof self._killsig !== "undefined") {
    process.nextTick(function() {
      self.emit("exit", 0, self._killsig);
    });
    return;
  }

  if (options.entryUri) {
    puri = options.entryUri;
  } else {
    puri = "<auto>";
  }

  // __parallMainProcessPID
  mainpid = parseInt(process.env.PARALL_MAIN_PROCESS, 10);

  if (isNaN(mainpid)) {
    mainpid = process.pid;
  }

  childargs = [__filename].concat(self._args);

  if (options.debug) {
    childargs.unshift("--debug");
  }

  env.PARALL_MAIN_PROCESS = mainpid;
  env.PARALL_ENTRY_POINT = modulepath;
  env.PARALL_ENTRY_URI = puri;

  spawnopts.env = env;
  spawnopts.cwd = options.cwd || undefined;
  spawnopts.customFds = options.customFds || [-1, -1, -1];
  spawnopts.setsid = options.setsid || false;

  execpath = options.execPath || process.execPath;
  child = spawn(execpath, childargs, spawnopts);

  self.pid = child.pid;
  self.stdin = child.stdin;
  self.stdout = child.stdout;
  self.stderr = child.stderr;
  self.kill = function(sig) {
    self._killsig = sig || "SIGTERM";
    child.kill(sig);
  };

  if (!("noerror" in options)) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", function(data) {
      console.log(data);
      stderrbuff = (stderrbuff && stderrbuff + data) || data;
    });
  }

  if ("pipe" in options) {
    process.stdout.once("error", function() {
      process.stdout.removeListener("error", arguments.callee);
      child.stdout.removeAllListeners("data");
    });
    child.stdout.on("data", function(data) {
      process.stdout.write(data);
    });
  }

  if (!("deamon" in options)) {
    process.on("exit", onprocessexit = function() {
      child.kill('SIGHUP');
    });
  }

  child.on("exit", function(code, signal) {
    var workererr;

    onprocessexit && process.removeListener("exit", onprocessexit);

    if (stderrbuff) {
      workererr = new WorkerError(self, stderrbuff);
      stderrbuff = undefined;
    } else if (code && !self._killsig && !("noerror" in options)) {
      workererr = new Error("Worker exited with error code " + code + " sig: " + signal);
    }

    if ("keepalive" in options) {
      process.nextTick(function() {
        startWorker(self);
      });
      self.emit("restart", workererr);
      return;
    }

    if ("join" in options) {
      workererr && process.stderr.write(workererr.toString());
      process.nextTick(function() {
        process.exit(code);
      });
      return;
    }

    workererr && self.emit("error", workererr);

    self._events && self._events.exit && self.emit("exit", code, signal);
  });

}


function WorkerError(worker, stack) {
  var message = [];

  message.push("WorkerError(#");
  message.push(worker.pid);
  message.push(", '");
  message.push(worker._module);
  message.push("'): \n");

  this.message = message.join("") + stack;

  Error.call(this, this.message);
}

inherits(WorkerError, Error);

WorkerError.prototype.toString = function() {
  return this.message;
};

// worker entry point;
function workermain() {
  var entrypoint;
  var entryuri;
  var stdmsg;

  if (!("PARALL_ENTRY_POINT" in process.env)) {
    throw new Error("Module entry point is not set");
  }

  entrypoint = process.env.PARALL_ENTRY_POINT;
  entryuri = process.env.PARALL_ENTRY_URI;

  if (entryuri !== "<disabled>" && entryuri !== "<auto>") {
    stdmsg = require("./util").openStdMsg();
    stdmsg.listen(entryuri);
  }

  require(entrypoint.substr(0, entrypoint.length -
                               extname(entrypoint).length));

}
// Run worker if executed by parent process.
(process.argv[1] == __filename) &&  workermain();