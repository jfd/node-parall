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
require("fibers");

var ID_POOL_MAX = 0xFFFFFF;
var ID_POOL_INITIAL_SIZE = 100;
var ID_POOL_INCREASE_STEP = 1.2;

var LOCAL = "L";
var REMOTE = "R";

var inherits = require("util").inherits;
var Module = require("module").Module;
var createScript = require("vm").createScript;
var path = require("path");
var inherits = require("util").inherits;

var destinations;


//
//  ### function initialize(entrypoint, [options])
//
//  Initializes the Parall envoriment for this process with
//  specified `entrypoint` and (optional) `options`. Argument `entrypoint`
//  can either be a `Function` or path to a module.
//
//  Parall can also be initialized directly from the
//  command-line. To initialize Parall from command-line, type
//  `parall [path_to_module]. It is also possible to pass options
//  via command arguments.
//
//  #### Usage
//
//      parall [options] MODULE [ARGS]
//
//      or
//
//      node parall.js [options] MODULE [ARGS]
//
//
//  #### Options
//      -h, --help                Shows help about command.
//          --no_entrypoint
//
//
//
exports.initialize = function(entrypoint, options) {
  var proclet;
  var fn;

  if (destinations) {
    throw new Error("Parall is already initialized");
  }

  destinations = {};

  switch (typeof entrypoint) {
    case "function":
      proclet = spawnLocalProclet(entrypoint);
      break;
    case "string":
      fn = compileProcletSandbox(entrypoint, null);
      proclet = spawnLocalProclet(fn);
      break;
    default:
      throw new Error("Expected a valid `entrypoint`");
  }

  return proclet;
};



//
//  ### function uid([id]) **internal**
//
//  Handles allocation and release of Proclet ID references. Call with
//  no arguments to allocate an ID. Call with an used and free ID to
//  release it.
//
var uid = (function() {
  var pool = new Array(ID_POOL_INITIAL_SIZE);
  var length = ID_POOL_INITIAL_SIZE;

  for (var i = 0; i < ID_POOL_INITIAL_SIZE; i++) {
    pool[i] = i + 1;
  }

  return function(id) {
    if (arguments.length) {
      pool.push(id);
    } else {
      if (pool.length === 0) {
        if (length + 1 == ID_POOL_MAX) {
          throw new Error("MAX_ID reached");
        }
        console.log("Increase uid pool" + length);
        for (var i = length + 1, l = (length * ID_POOL_INCREASE_STEP) + 1;
             i < l; i++) {
          pool.push(i);
        }
        length = l - 1;
      }

      return pool.shift();
    }
  };
})();



//
//  ### function spawnLocalProclet(fn) **internal**
//
//  Spawn creates a new Proclet, which is immediately started. The
//  reference to the newly spawned Proclet is returned.
//
function spawnLocalProclet(fn) {
  var fiber;
  var sig;
  var context;
console.log("spawnLocalProclet");
  fiber = Fiber(function() {
    var timerarr;
    try {
      console.log("run %s", context.ref);
      fn();
    } catch (signal) {
      if (signal instanceof ProcletExitSig) {
        sig = signal;
      } else {
        console.log("error %s", context.ref);
        sig = ProcletExitSig.fromError(signal, context.ref);
      }
    } finally {
      console.log("exit %s", context.ref);
      context.exit(sig);
    }
  });

  context = new LocalProcletContext(fiber);

  process.nextTick(function() {
    fiber.run();
  });

  return context.ref;
}



//
//  ### function genereateRef(hub, id) **internal**
//
//  Generates a new reference for a Proclet. The reference can be
//  used to send data to the specified Proclet.
//
function genereateRef(hub, id) {
  var ref = [hub];
  id = id.toString(16);
  for (var i = id.length; i < 9; i++) {
    ref.push("0");
  }
  ref.push(id);
  return ref.join("");
}



//
//  ### function getRunningProcletCtx([name]) **internal**
//
//  Returns the currently running Proclet context. 
//
function getRunningProcletCtx() {
  var current = Fiber.current;
  var ref;
  var ctx;

  if (current && (ref = current.__ref__) && (ctx = destinations[ref])) {
    return ctx;
  }
}



//
//  ### function validRefOrThrow(ref) **internal**
//
//  Throws an exception if `"ref"` is not a valid Proclet reference.
//
function validRefOrThrow(ref) {
  if (typeof ref !== string) {
    throw new Error("`ref` is not a valid Proclet reference");
  }
}



//
//  ### function getCallingRefOrThrow() **internal**
//
//  Gets the `ref` of calling Proclet.
//
function getCallingRefOrThrow(name) {
  var current = Fiber.current;
  var sender;

  if (!current || !(sender = current.__ref__)) {
    throw new Error("`" + name +"` works only from within a running Proclet.");
  }

  return sender;
}



//
//  ### function startTimer(delay, dest, msg) **exported**
//
//  Starts a new timer for calling Proclet. The `msg` is sent to `dest` after
// `delay`.
//
//  A `timerid` is return, which can be used to cancel the newly created
//  timer.
//
//  All started timers are automatically canceled when Proclet exits.
//
var startTimer = exports.startTimer = function(delay, dest, msg) {
  var ctx;

  if (dest === null) {
    return true;
  }

  if (typeof dest !== "string") {
    throw new Error("Invalid `ref`");
  }

  if (!(Array.isArray(msg))) {
    throw new Error("Expected `message` as `Array`");
  }

  if (!(ctx = getRunningProcletCtx())) {
    throw new Error("`startTimer` works only from within a running Proclet.");
  }

  return ctx.startTimer(delay, dest, msg);
};



//
//  ### function cancelTimer(timerid) **exported**
//
//  Cancel a timer of `timerid` started with `startTimer`. The function
//  returns `false` if `timerid` was invalid or already canceled, else
//  `true`.
//
var cancelTimer = exports.cancelTimer = function(timerid) {
  var ctx;

  if (!(ctx = getRunningProcletCtx())) {
    throw new Error("`cancelTimer` works only from within a running Proclet.");
  }

  return ctx.cancelTimer(timerid);
};



//
//  ### function receiveMessage([trapExit]) **exported**
//
//  Puts currently running Proclet in receive-mode. The function returns
//  when a new message has arrived.
//
var receiveMessage = exports.receiveMessage = function (trapExit) {
  var fiber;
  var proclet;
  var queue;
  var msg;

  fiber = Fiber.current;
  proclet = destinations[fiber && fiber.__ref__];

  if (!proclet) {
    throw new Error("receive cannot be could outside a Proclet context");
  }

  if ((queue = proclet.queue) && queue.length) {
    msg = queue.shift();
  } else {
    proclet.receiving = true;
    msg = Fiber.yield();
    proclet.receiving = false;
  }

  if (!trapExit) {
    if (msg[0] === "EXIT") {
      throw new ProcletExitSig(msg[2] || "unknown reason", msg[1]);
    }
  }

  return msg;
};



//
//  ### function sendMessage(fromRef, toRef, message)
//
//  Encodes and sends a message to specified Proclet reference.
//
var sendMessage = exports.sendMessage = function(fromRef, toRef, message) {
  process.nextTick(function() {
    var dest = destinations[toRef];
    if (dest) {
      dest.deliver(message);
    }
  });
};



//
//  ### function self() **builtin-function**
//  Returns a reference to currently running `proclet`. The function
//  returns `null` if not currently in a proclet-context.
//
//  #### Usage
//
//      var me = self();
//      console.log(me);
//
function selfImpl() {
  var fiber = Fiber.current;
  return fiber && fiber.__ref__ || null;
}



//
//  ### function receive(callbacks) **built-in function**
//
//  Puts current `proclet` in receive mode. The `proclet` is blocking
//  until a message has arived.
//
//  #### Usage
//
//       receive (
//          function ping(sender) {
//            send(sender, ["pong"]);
//          }
//       );
//
function receiveImpl() {
  var msg;
  var name;
  var fn;

  msg = receiveMessage();
  name = msg.shift();

  for (var i = 0, l=arguments.length; i < l; i++) {
    fn = arguments[i];
    if (fn.name === name) {
      fn.apply(null, msg);
    }
  }
}



//
//  ### function send(dest, message) **built-in function**
//
//  Send's a message to `dest` proclet reference. The message is
//  guaranteed to be delivered, as long as the proclet is running.
//
//  #### Usage
//
//       /* Sends a message to self */
//       send(self(), ["ping"])
//
function sendImpl(dest, message) {
  var current = Fiber.current;
  var sender;

  if (dest === null) {
    return true;
  }

  if (typeof dest !== "string") {
    throw new Error("Invalid `ref`");
  }

  if (!(Array.isArray(message))) {
    throw new Error("Expected `message` as `Array`");
  }

  if (!current || !(sender = current.__ref__)) {
    throw new Error("`send` works only from within a running Proclet.");
  }

  return sendMessage(sender, dest, message);
}



//
//  ### function exit(reason, [dest]) **built-in function**
//
//  Sends a exit signal to Proclet of `dest` with reason.
//
//  Function is defaulting to reference of calling Proclet if `dest` is
//  not set.
//
//  Exit signals can be trapped by specifing a proclet-flag. See section
//  proclet-flags.
//
//  #### Usage
//
//      /* Spawn a new Proclet and put it in receive-mode */
//      var worker = spawn(function() { receive(); });
//
//      /* Kill the worker */
//      exit("bye bye", worker);
//
//      /* Exit current Proclet.
//      exit("quiting");
//
function exitImpl(reason, dest) {
  var current = Fiber.current;
  var sender;

  if (typeof reason !== "string") {
    throw new Error("Argument `reason` must be of type String");
  }

  if (!current || !(sender = current.__ref__)) {
    throw new Error("`exit` works only from within a running Proclet.");
  }

  if (dest) {
    return sendMessage(sender, dest, ["EXIT", sender, reason]);
  } else {
    throw new ProcletExitSig(reason, sender);
  }
}



//
//  ### function link(ref)  **built-in function**
//
//  Links calling Proclet with `ref` Proclet. Returns `true` if link
//  was created, else `false`.
//
function linkImpl(ref) {
  var me;
  var linkarr;

  me = getCallingRefOrThrow("link");

  if (!destinations[ref]) {
    return sendMessage(calling, calling, ["EXIT", ref, "noproc"]);
  }

  if ((linkarr = links[ref])) {
    if (Array.isArray(linkarr)) {
      linkarr.push(me);
    } else {
      linkarr = [linkarr, me];
    }
  } else {
    links[ref] = me;
  }

  return true;
}



//
//  ### function unlink(ref)  **built-in function**
//
//  Unlinks calling Proclet with relationship to `ref` Proclet. Returns 
//  `true` if unlink was successfull or `false` if no link was found.
//
function unlinkImpl(ref) {
  var me;
  var linkarr;

  me = getCallingRefOrThrow("unlink");

  if ((linkarr = links[ref])) {
    
  }

  return false;
}



//
//  function compileProcletSandbox(request, parent) **internal**
//
//  Creates and compiles a new Proclet Sandbox for
//  specified module.
//
function compileProcletSandbox(request, parent) {
  var sandbox = {};
  var target;
  var content;
  var resolved;
  var filename;
  var id;

  resolved = Module._resolveFilename(request, parent);
  id = resolved[0];
  filename = resolved[1];

  content = require('fs').readFileSync(filename, 'utf8');
  content = content.replace(/^\#\!.*/, '');

  target = createScript(content, filename);
  Module.call(target, id, null);
  target.filename = filename;

  if (process.argv[1] == filename) {
    target.id = ".";
  }

  function spawn(entrypoint) {
    var fn;
    switch (typeof entrypoint) {
      case "function":
        return spawnLocalProclet(entrypoint);
      case "string":
        fn = compileProcletSandbox(entrypoint, target);
        return spawnLocalProclet(fn);
      default:
        throw new Error("Expected a valid `entrypoint`")
    }
  }

  function require(request) {
    return Module._load(request, target);
  }

  require.resolve = function(request) {
    return Module._resolveFilename(request, target)[1];
  }

  require.paths = Module._paths;
  require.main = process.mainModule;
  // Enable support to add extra extension types
  require.extensions = Module._extensions;

  require.cache = Module._cache;

  for (var k in global) {
    sandbox[k] = global[k];
  }

  sandbox.spawn = spawn;
  sandbox.self = selfImpl;
  sandbox.receive = receiveImpl;
  sandbox.exit = exitImpl;
  sandbox.send = sendImpl;
  sandbox.require = require;
  sandbox.exports = module.exports;
  sandbox.__filename = filename;
  sandbox.__dirname = path.dirname(filename);
  sandbox.module = module;
  sandbox.global = global;
  sandbox.root = root;

  return function() {
    target.runInNewContext(sandbox);
  };
}



//
//  ### constructor LocalProcletContext(fiber)
//
//
function LocalProcletContext(fiber) {

  this.id = uid();
  this.ref = genereateRef(LOCAL, this.id);
  this.fiber = fiber;

  this.receiving = false;

  this.mailbox = null;
  this.mailboxSize = 0;

  this.timers = null;

  this.linksIn = null;
  this.linksOut = null;

  Object.defineProperty(fiber, "__ref__", { value: this.ref });

console.log("starting dest: %s" , this.ref);
  destinations[this.ref] = this;
}

//
//  ### function LocalProcletContext.deliver(msg)
//
//  Delievers a message to the Proclet context owner.
//
LocalProcletContext.prototype.deliver = function(msg) {
  var mailbox;

  if (this.receiving) {
    this.fiber.run(msg);
  } else {
    this.mailboxSize++;
    if (!(mailbox = this.mailbox)) {
      this.mailbox = [msg];
    } else {
      mailbox.push(msg);
    }
  }
};



//
//  ### function LocalProcletContext.startTimer(delay, dest, msg)
//
//  Sends `"msg"` to `"dest"` after `"delay"`.
//
LocalProcletContext.prototype.startTimer = function(delay, dest, msg) {
  var self = this;
  var me = this.ref;
  var timers;
  var id;

  function callback() {
    self.cancelTimer(id);
    sendMessage(me, dest, msg);
  }

  id = setTimeout(callback, delay);

  if ((timers = this.timers)) {
    if (Array.isArray(timers)) {
      timers.push(id);
    } else {
      this.timers = [timers, id];
    }
  } else {
    this.timers = id;
  }

  return id;
};



//
//  ### function LocalProcletContext.cancelTimer(id)
//
//  Cancel timer of `"id"`.
//
LocalProcletContext.prototype.cancelTimer = function(id) {
  var timers;
  var index;

  if (!id || !(timers = this.timers)) {
    return false;
  }

  if (Array.isArray(timers)) {
    index = timers.indexOf(id);
    if (index === -1) {
      return false;
    }
    timers.splice(index, 1);
    if (!timers.length) {
      this.timers = null;
    }
  } else {
    if (this.timers != id) {
      return false;
    }
    this.timers = null;
  }

  clearTimeout(id);

  return true;
};



//
//  ### function LocalProcletContext.link(ref)
//
//  Link Proclet ctx with `"ref"` Proclet.
//
LocalProcletContext.prototype.link = function(ref) {
};



//
//  ### function LocalProcletContext.unlink(ref)
//
//  Link Proclet ctx with `"ref"` Proclet.
//
LocalProcletContext.prototype.link = function(ref) {
};



//
//  ### function LocalProcletContext.exit([sig])
//
//  Destroys the ctx with `"sig"`. 
//
LocalProcletContext.prototype.exit = function(sig) {
  var timers;

  sig = sig || new ProcletExitSig("normal", this.ref);

  uid(this.id);
  delete destinations[this.ref];

  if ((timers = this.timers)) {
    if (Array.isArray(timers)) {
      for (var i = 0, l = timers.length; i < l; i++) {
        clearTimeout(timers[i]);
      }
    } else {
      clearTimeout(timers);
    }
  }

  delete this.fiber.__ref__;

  this.timers = null;

  this.id = null;
  this.ref = null;
  this.fiber = null;

  console.log(sig.toString());
};



function ProcletExitSig(reason, sender) {
  this.reason = reason;
  this.sender = sender;
  this.iserror = false;
  this.stack = null;
}

ProcletExitSig.prototype.encode = function() {
  return {$ProcletExitSig: { reason: this.reason
                           , sender: this.sender
                           , iserror: this.iserror
                           , stack: this.stack
                           }};
};

ProcletExitSig.fromError = function (error, sender) {
  var sig = new ProcletExitSig(error.message, sender);
  sig.iserror = true;
  sig.stack = error.stack || null;
};

ProcletExitSig.prototype.toString = function() {
  return JSON.stringify(this.encode());
};


//
//  Initialize Parall Environment if module is mainModule.
//
if (process.mainModule === module) {

  process.argv.splice(1, 1);

  if (process.argv[1].indexOf('/') !== -1 &&
      process.argv[1].charAt(0) !== '/') {
    process.argv[1] = path.join(process.cwd(), process.argv[1]);
  }

  exports.initialize(process.argv[1], {});
}