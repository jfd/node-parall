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

const spawn                 = require("child_process").spawn
    , normalize             = require("path").normalize
    , basename              = require("path").basename
    , dirname               = require("path").dirname
    , extname               = require("path").extname
    , inherits              = require("util").inherits
    , RequestChannel        = require("./messaging").RequestChannel
    , slice                 = Array.prototype.slice

const SPAWN_OPTIONS_RE      = /^(join|pipe|noerror|keepalive|deamon)$/i;

/**
 *  ## Workers
 *
 */


/**
 *  ## spawn(module, ...)
 *
 *  Creates a new `Worker` and starts it with provided arguments.
 *
 *  The `spawn` function scans all given arguments for "option arguments".
 *
 *  This options are:
 *
 *  - `'join'`. Joins the process, which means that the parent process
 *    exit's when new child process exit's. The parent process exits with 
 *    same exit code.
 *  - `'pipe'`. Pipe workers `stdout` to current process `stdout`.
 *  - `'noerror'`. Do not emit `error` on error.
 *  - `'keepalive'`. Restarts the process on exit. Worker emits the `restart`
 *    event on each restart.
 *  - `'deamon'`. Start the worker in deamon-mode.
 *
 *  Example:
 *
 *      const spawn = require("parall").spawn;
 *      
 *      // Spawn a new worker in "silent"-mode.
 *      spawn("./worker", "silent");
 */
exports.spawn = function() {
  var args = slice.call(arguments);
  var module = args.shift();
  var options = {};
  var worker;
  
  args = parseoptions(args, options);
  worker = new Worker(module, options, args);
  startWorker(worker);
  
  return worker;
} 


/**
 *  ## Worker
 *
 *  The Worker class.
 */
function Worker(module, options, args) {
  RequestChannel.call(this);
  
  this.stdin = null;
  this.stdout = null;
  this.stderr = null;
  this.pid = null;
  
  this._module = module;
  this._options = options;
  this._args = args;
  this._killsig = undefined;
}

inherits(Worker, RequestChannel);
exports.Worker = Worker;

/**
 *  ### Worker.kill(signal='SIGTERM')
 *
 *  Send a signal to the process. If no argument is given, the process 
 *  will be sent 'SIGTERM'. See signal(7) for a list of available signals.
 *
 *      const spawn = require('parall').spawn;
 *      
 *      var p = spawn("./worker");
 *
 *      p.kill("SIGHUP")
 *
 *  Note that while the function is called kill, the signal delivered to the 
 *  child process may not actually kill it. kill really just sends a signal 
 *  to a process.
 *
 *  See kill(2)
 */
Worker.prototype.kill = null;

// Start the process
function startWorker(self) {
  var modulepath = resolveModulePath(self._module);
  var mainpid = process.__parallMainProcessPID || process.pid;
  var options = self._options;
  var child;
  var childargs;
  var stderrbuff;
  var stdoutbuff;
  var onprocessexit;
  
  if (typeof self._killsig !== "undefined") {
    process.nextTick(function() {
      self.emit("exit", 0, self._killsig);
    });
    return;
  }

  childargs = [__filename, mainpid, modulepath].concat(self._args);

  child = spawn(process.execPath, childargs);
  
  self.pid = child.pid;
  self.stdin = child.stdin;
  self.stdout = child.stdout;
  self.stderr = child.stderr;
  self.kill = function(sig) { self._killsig = sig || null; child.kill(sig); }


  if (!("noerror" in options)) {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", function(data) {
      stderrbuff = (stderrbuff && stderrbuff + data) || data;
    });
  }
  
  if ("pipe" in options) {
    child.stdout.on("data", function(data) {
      process.stdout.write(data);
    });
  }
  
  if (!("deamon" in options)) {
    process.on("exit", onprocessexit = function() {
      child.exit('SIGHUP');
    });
  }
  
  child.on("exit", function(code, signal) {
    var workererr;

    onprocessexit && process.removeListener("exit", onprocessexit);
    
    if (stderrbuff) {
      workererr = new WorkerError(self, stderrbuff);
      stderrbuff = undefined;
    }
    
    if ("keepalive" in options) {
      process.nextTick(function() {
        startWorker(self);
      });
      self.emit("restart", workererr);
      return;
    }
    
    if ("join" in options) {
      stderrbuff && process.stderr.write(stderrbuff);
      process.nextTick(function() {
        process.exit(code);
      });
      return;
    } 
    
    workererr && self.emit("error", workererr);

    if (self._events) {
      self._events["exit"] && self.emit("exit", code, signal);
      self._events["message"] && self.emit("message", [code, signal]);
    } else if (process._events && process._events["message"]) {
      process.emit("message", [code, signal]);
    }
    
  });
}

// Parse options from arguments
function parseoptions(args, options) {
  return args.filter(function(name) {
    if (SPAWN_OPTIONS_RE.test(name)) {
      options[name.toLowerCase()] = true;
      return false;
    } else {
      return true;
    }
  });  
}

// Try to resolve a path expression.   
function resolveModulePath(path) {
  var scriptDir = dirname(process.argv[1]);

  if (path[0] == '/') {
    return path;
  }
  if (path.substring(0, 2) == "./") {
    return normalize(normalize(scriptDir + "/" + path.substr(2)));
  } 
  if (path.substring(0, 3) == "../") {
    return normalize(normalize(scriptDir + "/" + path));
  } 
  return path;
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
}

// worker entry point;
function workermain() {
  var node = process.argv.shift();
  var scriptPath = process.argv.shift();
  var mainProcessId = parseInt(process.argv.shift());
  var workerPath = process.argv.shift();
  var notif = null;
  
  // Fix process arguments
  process.argv = [node, workerPath].concat(process.argv);
   
  process.__parallMainProcessPID = mainProcessId; 
  
  require(workerPath.substr(0, workerPath.length - 
                               extname(workerPath).length));
  
}
// Run worker if executed by parent process.
(process.argv[1] == __filename) &&  workermain();