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
    , createConnection      = require("net").createConnection
    , notEqual              = require("assert").notEqual
    
const DEFAULT_WORKER_OPTS   = {
  logStdout: true,
  logStderr: false,
  restartOnSucess: false,
  restartOnError: false
}

var notifServer = null
  , notifServerCloseTimeout = null
  , notifServerStarting = false
  , notifServerClosing = false
  , notifServerBindCallbacks = [];

    
/**
 *  Creates a new WorkerPool instance.
 *  command, poolSize, args, options, callback
 */
exports.spawn = function() {
  var args = Array.prototype.slice.call(arguments);
  var command = args.shift();
  var poolsize = typeof args[0] == "number" ? args.shift() : 1;
  var workerargs = Array.isArray(args[0]) ? args.shift() : undefined;
  var callback = typeof args[0] == "function" ? args.shift() : undefined;
  var options = typeof args[0] == "object" ? args.shift() : {};
  var pool = new WorkerPool(command, poolsize, workerargs, options);
  pool.run(callback);
  return pool;
}

/**
 *  Spawns a single worker.
 */
exports.spawnWorker = function(command, args, options, callback) {
  var worker = new WorkerProcess(command, args, options);
  
  function done(code, signal, error) {
    worker.removeListener("spawn", done);
    worker.removeListener("error", done);
    callback && callback(code, signal, error);
  }
  
  worker.on("spawn", done);
  worker.on("error", done);
  
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
  this.restarting = false;
  this.running = false;
  this.command = command;
  this.args = args;
  this.restartOnSucess = opts.restartOnSucess;
  this.restartOnError = opts.restartOnError;
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
  
  this.starting = true;
  this.restarting = false;

  getNotifServer(function(error, notifServer) {
    child = spawn(process.execPath, args);

    self.pid = child.pid;
    
    function notifcallback() {
      self.starting = false;
      self.running = true;
      self.emit("spawn");
    }
    
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
      var haderror = !self.running || self.lastError;
      var running = self.running;

      notifServer.removeCallback(child.pid, notifcallback);

      self.restarting = (code && self.restartOnError && running) ||
                        (code == null && self.restartOnSucess && running);
                      
      self.pid = null;
      self._child = null;
      self.running = false;
      self.starting = false;

      if (haderror) {
        self.emit("error", self.lastError);
      } 

      self.emit("exit", code, signal, self.lastError);

      self.restarting && process.nextTick(self.run.bind(self));
      
      self.lastError = null;
    });

    notifServer.addCallback(child.pid, notifcallback);

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
  
  // onspawn
  
  function onspawn() {
    this.removeListener("spawn", onspawn);
    this.removeListener("error", onerror);

    // Hook spawn again. This event will be emitted when a 
    // worker restarts.
    this.on("spawn", function() {
      self.emit("spawn", this);
      self.emit("update");
    });

    // Main process should not die just because a worker die. Hook 
    // error event to prevent it from leaking. 
    this.on("error", function(error) {
      self.emit("workerError", error);
    });

    this.on("exit", function(code, signal, error) {
      var workers = self._workers;
      var index = workers.indexOf(this);

      notEqual(index, -1);
      !this.restarting && workers.splice(index, 1);

      self.emit("exit", this, code, signal, (code && this.lastError));

      if (!workers.length) {
        self.emit("empty");
      }

    });

    self.emit("spawn", this);

    if (++count == self._poolSize) {
      self.starting = false;
      self.running = true;
      self.emit("full");
      self.emit("update");
      callback && callback();
    }
  }
  
  // onerror
  
  function onerror(lastError) {
    var index = self._workers.length;
    var worker = null;

    while (index--) {
      worker = self._workers[index];
      worker.removeListener("spawn", onspawn);
      worker.removeListener("error", onerror);
      worker.kill();
    }

    self.starting = false; 

    // Only emit error if no callback.
    if (callback) {
      callback(lastError);
    } else {
      self.emit("error", lastError);
    }
  }
  
  while (count--) {
    worker = new WorkerProcess(command, args, options);
    worker.run();

    this._workers.push(worker);
       
    worker.on("spawn", onspawn);
    worker.on("error", onerror);
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
  
  function bind() {
    var callbacks = {};
    
    notifServer = createServer(function(stream) {
      var buffer = "";
      stream.setEncoding("ascii");
      stream.on("data", function(data) {
        var pid;
        var callback;

        buffer += data;

        if (buffer.indexOf("\n") != -1) {
          pid = parseInt(buffer);
          callback = callbacks[pid];
          callback && callback();
          notifServer.removeCallback(pid, callback);
          stream.destroy();
        }
      });
    });
    
    notifServer.addCallback = function(pid, callback) {
      notifServerCloseTimeout && clearTimeout(notifServerCloseTimeout);
      callbacks[pid] = callback;
    }

    notifServer.removeCallback = function(pid, callback) {
      var self = this;
      
      if (!callbacks[pid]) {
        return;
      }

      delete callbacks[pid];

      if (!Object.keys(callbacks).length) {
        notifServerCloseTimeout = setTimeout(function() {
          notifServer = null;
          notifServerClosing = true;
          self.close();
        }, 500);
      }
    }

    notifServer.on("close", function() {
      notifServerClosing = false;
      notifServerStarting && bind();
    });

    notifServer.listen(getNotifSockName(process.pid), onbind);
  }

  !notifServerClosing && bind();
}

function getNotifSockName(pid) {
  return "/tmp/parall-notif-" + pid + ".sock";
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
