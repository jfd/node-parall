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

const EventEmitter          = require("events").EventEmitter
    , spawn                 = require("child_process").spawn
    , normalize             = require("path").normalize
    , basename              = require("path").basename
    , dirname               = require("path").dirname
    , extname               = require("path").extname
    , inherits              = require("util").inherits
    , slice                 = Array.prototype.slice

const SPAWN_OPTIONS_RE      = /^(join|pipe|noerror|keepalive|deamon)$/i;

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
    } else {
      
      name = arg && arg.toString().toLowerCase() || "<unknown>";
      
      if (SPAWN_OPTIONS_RE.test(name)) {
        options[name] = true;
      } else {
        throw new Error("Bad option: `" + name + "`");;
      }
    } 
  });  
  
  worker = new Worker(path, options, workerargs);
  startWorker(worker);
  
  return worker;
} 

function Worker(module, options, args) {
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
inherits(Worker, EventEmitter);


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
  self.kill = function(sig) { 
    self._killsig = sig || "SIGTERM"; 
    child.kill(sig); 
  }


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
      console.log("signal: " + self._killsig);
      workererr = new Error("Worker exited with error code " + code);
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
      
    self._events && self._events["exit"] && self.emit("exit", code, signal);
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