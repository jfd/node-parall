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
 *  THIS SOFTWARE IS PROVIDED BY HYDNA AB ``AS IS'' AND ANY EXPRESS 
 *  OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
 *  ARE DISCLAIMED. IN NO EVENT SHALL HYDNA AB OR CONTRIBUTORS BE LIABLE FOR 
 *  ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL 
 *  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR 
 *  SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) 
 *  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT 
 *  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY 
 *  OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF 
 *  SUCH DAMAGE.
 *
 */
const spawn                 = require("child_process").spawn
    , Script                = process.binding('evals').Script
    , EventEmitter          = require("events").EventEmitter
    , readFileSync          = require("fs").readFileSync
    , normalize             = require("path").normalize
    , basename              = require("path").basename
    , dirname               = require("path").dirname
    , extname               = require("path").extname
    , inherits              = require("sys").inherits
    , print                 = require("sys").print
    , createServer          = require("net").createServer
    , createConnection      = require("net").createConnection;
    
const DEFAULT_WORKER_OPTS   = {
  logStdout: true,
  logStderr: false,
  restartOnSucess: false,
  restartOnError: false
}

var notifServer = null
  , notifServerStarting = false
  , notifServerBindCallbacks = [];

    
/**
 *  Creates a new WorkerPool instance.
 */
exports.spawn = function(command, poolSize, args, callback) {
  var pool = new WorkerPool(command, poolSize, args);
  
  
  function done(code, signal, lastError) {
    
    // Kill process if on error and no defined callback
    if ((code || signal) && !callback && 
        (!pool._events || !pool._events["startFailure"])) {
      throw new Error(lastError) || 
            new Error("Spawn failure, exit code " + code);
    }
    
    callback && callback(code, signal);
  }
  
  pool.run(done);
  
  return pool;
}

/**
 *  Spawns a single worker.
 */
exports.spawnWorker = function(command, args, options, callback) {
  var worker = new WorkerProcess(command, args, options);
  
  function done(code, signal) {
    worker.removeListener("start", done);
    worker.removeListener("startFailure", done);
    callback && callback(code, signal);
  }
  
  worker.on("start", done);
  worker.on("startFailure", done);
  
  worker.run();
  
  return worker;
}

/**
 *  Creates a new WorkerProcess instance.
 */
function WorkerProcess(command, args, options) {
  var opts = extend(DEFAULT_WORKER_OPTS, options);
  this.pid = null;
  this._child = null;
  this.starting = false;
  this.running = false;
  this.command = command;
  this.args = args;
  this.restartOnSucess = opts.restartOnSucess;
  this.restartOnFailure = opts.restartOnFailure;
  this.logStdout = opts.logStdout;
  this.logStderr = opts.logStderr;
  this.lastError = null;
}

exports.WorkerProcess = WorkerProcess;
inherits(WorkerProcess, EventEmitter);

WorkerProcess.prototype.run = function() {
  var self = this;
  var cmdPath = resolveWorkerPath(this.command);
  var spath = __filename;
  var mainpid = process.__parallMainProcessPID || process.pid;
  var parentpid = process.pid;
  var args = [spath, mainpid, parentpid, cmdPath].concat(this.args || []);
  var child = null;

  if (this.starting || this.running) {
    throw new Error("WorkerProcess is already running");
  }

  getNotifServer(function(error, notifServer) {
    child = spawn(process.execPath, args);

    self.pid = child.pid;
    
    child.stderr.on("data", function(data) {
      self.lastError = (self.lastError && self.lastError + data) || data;
      if (self.logStderr) {
        if (process.__parallMainProcessPID == process.pid) {
          print("Worker-err " + self.toString() + "->" + data);
        } else {
          print("\n           " + self.toString() + "->" + data);
        }
      }      
    });

    if (self.logStdout) {
      child.stdout.on("data", function(data) { 
        if (!process.__parallMainProcessPID) {
          print(self.toString() + " " + data);
        } else {
          print("-->" + self.toString() + " " + data);
        }
      });
    }

    child.on("exit", function(code, signal) {
      var event = self.running ? "stop" : "startFailure";

      if (code == null && self.restartOnError && self.running) {
        process.nextTick(function() { self._run() });
      }

      if (code && self.restartOnSucess && self.running) {
        process.nextTick(function() { self._run() });
      }

      self.starting = false;
      self.running = false;
      self.emit(event, code, signal, (code && self.lastError));
      self.pid = null;
      self._child = null;
    });

    notifServer.addCallback(child.pid, function() {
      self.starting = false;
      self.running = true;
      self.emit("start");
    });

    self._child = child;    
  });
}

WorkerProcess.prototype.kill = function(sig) {
  if (this.starting || this.running) {
    this._child.kill(sig);
  }
}

WorkerProcess.prototype.toString = function() {
  var pid = this.pid || "NO_PID";
  return this.command + "(" + pid + ")";
}

/**
 *  Creates a new WorkerPool instance
 */
function WorkerPool(command, poolSize, args, options) {
  this.running = false;
  this.starting = false;
  this._workers = [];
  this._poolSize = poolSize || 1;
  this._command = command;
  this._args = args;
  this._options = options || {};
}

exports.WorkerPool = WorkerPool;
inherits(WorkerPool, EventEmitter);

/**
 *  Returns a list with all PIDs in this WorkerPool instance.
 */
Object.defineProperty(WorkerPool.prototype, "pids", {
  get: function() {
    var index = this._workers.length;
    var pids = [];
    var worker;

    while (index--) {
      worker = this._workers[index];
      if (worker.pid) {
        pids.push(worker.pid);
      }
    }
    
    return pids;
  }
});

/**
 *  Returns the size of the worker pool or resizes the pool.
 *
 *  Note: If the pool is decreased, workers with lowest load will gently be
 *  terminated.
 */
Object.defineProperty(WorkerPool.prototype, "poolSize", {
  get: function() {
    return this._poolSize;
  },
  set: function() {
    throw new Error("TODO: poolSize::set");
  }
});

/**
 *  Start all processes in this WorkerPool instance.
 */
WorkerPool.prototype.run = function(callback) {
  var self = this;
  var count = this._poolSize;
  var worker = null;
  var command = this._command;
  var args = this._args;
  var options = this._options;
  var readycount = 0;
  
  if (this.starting || this.running) {
    throw new Error("WorkerPool is already running");
  }

  this.starting = true;
  
  function started() {
    this.removeListener("start", started);
    this.removeListener("startFailure", failure);

    this.on("start", function() {
      self.emit("workerStart", this);
      self.emit("update");
    });

    this.on("stop", function(code, signal) {
      var workers = self._workers;
      var index = workers.indexOf(this);
      
      if (index !== -1) {
        workers.splice(index, 1);
      }

      self.emit("workerStop", this, code, signal, (code && this.lastError));

      if (!workers.length && !options.restartOnError) {
        self.emit("stop");
      }
      
    });
    
    self.emit("workerStart", this);

    if (++count == self._poolSize) {
      self.starting = false;
      self.running = true;
      self.emit("start");
      self.emit("update");
      callback && callback();
    }
  }
  
  function failure(code, signal, lastError) {
    var index = self._workers.length;
    var worker = null;
    
    while (index--) {
      worker = self._workers[index];
      worker.removeListener("start", started);
      worker.removeListener("startFailure", failure);
      worker.kill();
    }

    self.starting = false; 
    
    self.emit("startFailure", code, signal, lastError);
    callback && callback(code, signal, lastError);
  }

  while (count--) {
    worker = new WorkerProcess(command, args, options);
    this._workers.push(worker);
    worker.run();
    worker.on("start", started);
    worker.on("startFailure", failure);
  }
  
  count = 0;
}

/**
 *  Annoucements workpool changes to specified Channel.
 */
WorkerPool.prototype.announceTo = function() {
  var self = this;
  var graph = Array.prototype.slice.call(arguments);
  var channel = graph.shift();
  var bcast = channel ? channel.bcast : null;
  
  if (!bcast) {
    throw new Error("Expected a Channel with broadcast support.");
  }
  
  function announce() {
    var msg = graph.concat([self.pids]);
    bcast.apply(channel, msg);
  }
  
  this.on("start", announce);
  this.on("workerStart", announce);
}

WorkerPool.prototype.toString = function() {
  var pids = this.pids;
  return "WorkerPool(" + this._command + ", " + pids.length + ")";
}


function resolveWorkerPath(path) {
  var scriptDir = dirname(process.argv[1]);

  if (path[0] == '/') {
    return path;
  }
  if (path.substring(0, 2) == "./") {
    return normalize(normalize(scriptDir + "/" + path.substr(2)))
  } 
  return path;
}

/**
 *  Run worker code
 */
function run() {
  var node = process.argv.shift();
  var scriptPath = process.argv.shift();
  var mainProcessId = parseInt(process.argv.shift());
  var parentId = parseInt(process.argv.shift());
  var workerPath = process.argv.shift();
  var notif = null;
  var sandbox = { require: require, process: process, console: console,
                  setTimeout: setTimeout, module: module, global: global,
                  __filename: workerPath, __dirname: dirname(workerPath)};
  
  // Fix process arguments
  process.argv = [node, workerPath].concat(process.argv);
   
  if (!parentId) {
    process.exit(1);
    return;
  }

  process.__parallMainProcessPID = mainProcessId; 
  process.__parallParentProcessPID =  parentId;
  
  require(workerPath.substr(0, workerPath.length - 
                               extname(workerPath).length));
  
  notif = createConnection(getNotifSockName(parentId));

  notif.on("connect", function() {
    this.write(process.pid + "\n");
  });
  
  notif.on("error", function(err) {
    console.log(err)
    process.exit(2);
  });

}

function getNotifServer(callback) {

  if (notifServer && !notifServerStarting) {
    callback(null, notifServer);
    return;
  } else {
    notifServerBindCallbacks.push(callback);  
    if (notifServer) {
      return;
    }
  }
  
  function onbind() {
    var cb = null;
    
    notifServerStarting = false;
    
    while ((cb = notifServerBindCallbacks.pop())) {
      cb(null, notifServer);
    }
  }
  
  notifServerStarting = true;
  
  notifServer = createServer(function(stream) {
    var buffer = "";
    stream.setEncoding("ascii");
    stream.on("data", function(data) {
      var pid;
      var callback;
      
      buffer += data;
      
      if (buffer.indexOf("\n") != -1) {
        pid = parseInt(buffer);
        callback = notifServer._callbacks[pid];
        callback && callback();
        delete notifServer._callbacks[pid];
        stream.destroy();
      }
    });
    
  });

  notifServer._callbacks = {};

  notifServer.addCallback = function(pid, callback) {
    notifServer._callbacks[pid] = callback;
  }

  notifServer.listen(getNotifSockName(process.pid), onbind);
}

function getNotifSockName(pid) {
  return "/tmp/worker-notif-" + pid + ".sock";
}

function extend(a, b) {
  var result = {};
  for (var key in a) {
    result[key] = a[key];
  }
  for (var key in b) {
    result[key] = b[key];
  }
  return result;
}

// Run worker if we are currently being executed.
if (process.argv[1] == __filename) {
  run();
}
