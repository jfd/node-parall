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

var ID_POOL_MAX = 0xFFFF;
var ID_POOL_INITIAL_SIZE = 100;
var ID_POOL_INCREASE_STEP = 1.2;

var inherits = require("util").inherits;
var EventEmitter = require("events").EventEmitter;
var Module = require("module").Module;
var createScript = require("vm").createScript;
var path = require("path");
var inherits = require("util").inherits;
var createServer = require("net").createServer;

var LOCAL_NODE = new NodeRef(0);
var NOMATCH = {};

var bifs = {};

var locals;
var server;
var namedRefs;
var namedRefsRev;
var nodes;


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
  var nodule;
  var result;

  if (locals) {
    throw new Error("Parall is already initialized");
  }

  locals = {};
  namedRefs = {};
  namedRefsRev = {};

  result = compileNoduleSandbox(entrypoint, null);

  return spawnLocal.apply(null, result);
};



//
//  ### function getCallingContext([name]) **exported**
//
//  Returns the currently running Nodule context. 
//
function getCallingContext() {
  var current = Fiber.current;
  var ref;
  var ctx;

  if (current && (ref = current.__ref__) && (ctx = locals[ref.id])) {
    return ctx;
  }
};



//
//  ### function isnodule() **exported**
//
//  See `parall/isnodule` in `api.md` for documentation and usage. 
//
exports.isnodule = function() {
  return getCallingContext() ? true : false;
};



//
//  ### function startTimer(delay, dest, msg) **exported**
//
//  See `parall/startTimer` in `api.md` for documentation and usage. 
//
exports.startTimer = function(delay, dest, msg) {
  var caller;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  if (typeof delay !== "number" || delay < 0) {
    throw new Error("bad argument `delay`");
  }

  if (!Array.isArray(msg)) {
    throw new Error("bad argument `msg`");
  }

  if (typeof dest == "string") {
    dest = resolveRef(dest);
  }

  if (dest instanceof LocalRef && !(dest = locals[dest.id])) {
    throw new Error("bad argument, `dest`");
  }

  return startTimer(caller, delay, dest, msg);
};

function startTimer(caller, delay, dest, msg, options) {
  var callback;

  if (dest instanceof LocalContext) {
    callback = timerLocalCallback;
  } else {
    callback = timerRemoteCallback;
  }

  id = setTimeout(callback, delay, caller, dest, msg, options);

  if ((timers = caller.timers)) {
    if (timers.length) {
      timers.push(id);
    } else {
      caller.timers = [timers, id];
    }
  } else {
    caller.timers = id;
  }

  return id;
}

function timerLocalCallback(caller, dest, msg, options) {
  if (caller.id) {
    cancelTimer(caller, this);
    if (dest.id) {
      sendLocal(dest, msg, options);
    }
  }
}

function timerRemoteCallback(caller, dest, msg, options) {
  if (caller.id) {
    cancelTimer(caller, this);
    // TODO
  }
}



//
//  ### function LocalContext.cancelTimer(id)
//
//  Cancel timer of `"timerid"`.
//
exports.cancelTimer = function(id) {
  var caller;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  return cancelTimer(caller, id);
};

function cancelTimer(caller, id) {
  var timers = caller.timers;
  var index;

  if (!id || !(timers = caller.timers)) {
    return false;
  }

  if (timers.length) {
    index = timers.indexOf(id);
    if (index === -1) {
      return false;
    }
    timers.splice(index, 1);
    if (!timers.length) {
      caller.timers = null;
    }
  } else {
    if (caller.timers != id) {
      return false;
    }
    caller.timers = null;
  }

  clearTimeout(id);

  return true;
}



//
//  ### function self() **built-in function**
//
//  See `BIF/self` in `api.md` for documentation and usage.
//
bifs.self = function() {
  var ctx = getCallingContext();
  return ctx && ctx.ref || null;
};



//
//  ### function node([ref]) **built-in function**
//
//  See `BIF/node` in `api.md` for documentation and usage.
//
bifs.node = function(ref) {
  ref = ref || exports.self();
  return ref ? ref.node : null;
};



//
//  ### function register(regname, ref) **built-in function**
//
//  See `BIF/register` in `api.md` for documentation and usage.
//
bifs.register = function(regname, ref) {

  if (typeof regname !== "string") {
    throw new Error("bad argument, `regname`");
  }

  if (namedRefs[regname]) {
    throw new Error("bad argument, ´regname` is already registered");
  }

  if (namedRefsRev[ref]) {
    throw new Error("bad argument, ´ref` is already named");
  }

  if (ref instanceof LocalRef ||
      ref instanceof RemoteRef ||
      ref instanceof NodeRef) {
    namedRefs[regname] = ref;
    namedRefsRev[ref] = regname;
    return true;
  } else {
    throw new Error("bad argument, `ref` must be local, remote or node.");
  }
};



//
//  ### function unregister(regname) **built-in function**
//
//  See `BIF/unregister` in `api.md` for documentation and usage.
//
bifs.unregister = function(regname) {
  var ref;

  if (!(ref = namedRefs[regname])) {
    return false;
  }

  namedRefs[regname] = null;
  namedRefsRev[ref] = null;

  return true;
};



//
//  ### function whereis(regname) **built-in function**
//
//  See `BIF/whereis` in `api.md` for documentation and usage.
//
bifs.whereis = function(regname) {
  return namedRefs[regname] || null;
};



//
//  ### function registered(regname) **built-in function**
//
//  See `BIF/registered` in `api.md` for documentation and usage.
//
bifs.registered = function() {
  return Object.keys(namedRefs);
};



//
//  ### function spawn() **built-in function**
//
//  See `BIF/spawn` in `api.md` for documentation and usage.
//
bifs.spawn = function(entrypoint) {
  var module;
  var result;

  if ((caller = getCallingContext())) {
    module = caller.module;
  }

  switch (typeof entrypoint) {
    case "function":
      return spawnLocal(module, entrypoint);
    case "string":
      result = compileNoduleSandbox(entrypoint, module);
      return spawnLocalNodule.apply(null, result);
    default:
      throw new Error("Expected a valid `entrypoint`")
  }
};

//
//  ### function spawnLocal(module, fn) **internal**
//
//  Spawn creates a new Nodule, which is immediately started. The
//  reference to the newly spawned Nodule is returned.
//
function spawnLocal(module, fn) {
  var fiber;
  var sig;
  var context;

  fiber = Fiber(function() {
    var timerarr;
    try {
      fn();
    } catch (signal) {
      if (signal instanceof ExitSig) {
        sig = signal;
      } else {
        sig = new ExitSig(context.ref, signal);
      }
    } finally {
      context.reset(sig || new ExitSig(context.ref, "normal"));
    }
  });

  context = new LocalContext(module, fiber);

  process.nextTick(function() {
    fiber.run();
  });

  return context.ref;
}

function spawnRemote() {
  
}



//
//  ### function receive(callbacks) **exported**
//
//  See `BIF/receive` in `api.md` for documentation and usage.
//
bifs.receive = function() {
  var caller;
  var msg;
  var match;
  var result;
  var fn;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  function waitForMessage() {
    var queue;
    var msg;
    if ((queue = caller.queue) && queue.length) {
      msg = queue.shift();
      caller.mailboxSize--;
    } else {
      caller.receiving = true;
      msg = Fiber.yield();
      caller.receiving = false;
    }
    return msg;
  }

  if (arguments.length) {
    match = collectPatterns(arguments);
    msg = waitForMessage();

    if ((fn = match[msg[0]])) {
      if ((result = fn.apply(null, msg.slice(1))) == NOMATCH &&
          (fn = match[""])) {
        fn(msg);
      }
    } else if ((fn = match[""])) {
      fn.apply(null, msg);
    }
  } else {
    return waitForMessage();
  }
};

function collectPatterns(args) {
  var patterns = {};
  var name;
  var fn;
  var pattern;

  for (var i = 0, l = args.length; i < l; i++) {
    fn = args[i];
    name = fn.name;
    if ((pattern = patterns[name])) {
      pattern[fn.length] = fn;
    } else {
      patterns[name] = pattern = buildMatch();
      pattern[fn.length] = fn;
    }
  }

  return patterns;
}

function buildMatch() {
  var count;
  var self = function() {
    var fn;
    if (!(fn = self[arguments.length])) {
      count = self.length;
      while (!(fn = self[count--]) && count > -1) { }
      if (!fn) return NOMATCH;
    }
    return fn.apply(self, arguments);
  };
  return self;
};

//
//  ### function link(ref)  **built-in function**
//
//  See `BIF/link` in `api.md` for documentation and usage.
//
bifs.link = function(ref) {
  var caller;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  if (!ref) {
    return false;
  }

  if (typeof ref == "string") {
    ref = resolveRef(ref);
  }

  if (caller.ref == ref) {
    return false;
  }

  if (ref instanceof LocalRef) {

    if ((ref = locals[ref.id])) {
      return linkLocal(caller, ref)
    }

    exitLocal(caller, caller.ref, "nonodule");
    return false;
  }

  return linkRemote(caller, ref);
};



//
//  Link local nodule with remote nodule or node. `"caller"` can be a local
//  `Context` or a remote `Ref`. `"target"` MUST be a local `Context`.
//
function linkLocal(caller, target) {
  var links;

  if ((links = target.linksIn)) {
    if (links.length) {
      links.push(caller);
    } else {
      target.linksIn = [links, caller];
    }
  } else {
    target.linksIn = caller;
  }

  if (caller instanceof LocalContext) {
    if ((links = caller.linksOut)) {
      if (links.length) {
        links.push(target);
      } else {
        caller.linksOut = [links, target];
      }
    } else {
      caller.linksOut = target;
    }
  } else {
    // TODO: Find node and send a message.
  }

  return true;
};



//
//  Link remote. Caller MUST be a local `Context. `target` MUST be a 
//  `RemoteRef`.
//
function linkRemote(caller, target) {
  // TODO
}


//
//  ### function unlink(ref)  **built-in function**
//
//  See `BIF/unlink` in `api.md` for documentation and usage.
//
bifs.unlink = function(ref) {
  var caller;
  var dest;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  if (!ref) {
    return false;
  }

  if (typeof ref == "string") {
    ref = resolveRef(ref);
  }

  if (caller.ref == ref) {
    return false;
  }

  if (ref instanceof LocalRef) {

    if ((ref = locals[ref.id])) {
      return unlinkLocal(caller, ref)
    }

    return false;
  }

  return unlinkRemote(caller, ref);
};


//
//  function unlinkLocal(caller, target, [sig]) **internal**
//
//  Unlinks `"caller"` with `"target". `"caller"` can be a `RemoteRef` or
//  a `LocalContext`. `"target"` MUST BE a `LocalContext`.
//
function unlinkLocal(caller, target, sig) {
  var links;
  var index;

  if ((links = target.linksIn) && links.length) {
    index = links.indexOf(caller);
    links.splice(index, 1);
    target.linksIn = links.length && links || null;
  } else {
    target.linksIn = null;
  }

  if (caller instanceof LocalContext) {
    if ((links = caller.linksOut) && links.length) {
      index = links.indexOf(target);
      if (index === -1) {
        return false;
      }
      links.splice(index, 1);
      caller.linksOut = links.length && links || null;
    } else {
      if (caller.linksOut !== target) {
        return false;
      }
      caller.linksOut = null;
    }
    if (sig) {
      exitLocal(caller, sig);
    }
  } else {
    // TOOD: Send to remote
  }

  return true;
}

function unlinkRemote(caller, target) {
  
}


//
//  ### function send(dest, msg, options) **exported**
//
//  Sends `"`msg"` to "`dest`".
//
bifs.send = function(dest, msg, options) {

  if (dest === null) {
    return true;
  }

  if (!(Array.isArray(msg))) {
    throw new Error("Bad argument, expected `message` as `Array`");
  }

  if (typeof dest === "string") {
    dest = resolveRef(dest);
  }

  if (dest instanceof LocalRef) {
    return sendLocal(locals[dest.id], msg, options);
  }

  if (dest instanceof RemoteRef) {
    return sendRemote();
  }

  throw new Error("invalid `dest`");
};

function sendLocal(target, msg, options) {
  var mailbox;

  if (!target) {
    return false;
  }

  if (target.receiving) {
    process.nextTick(function() {
      target.fiber && target.fiber.run(msg);
    })
  } else {
    target.mailboxSize++;
    if (!(mailbox = target.mailbox)) {
      target.mailbox = [msg];
    } else {
      mailbox.push(msg);
    }
  }
}

function sendRemote(node, id, msg, options) {
  // TODO
}



//
//  ### function exit(reason, [ref]) **built-in function**
//
//  See `BIF/exit` in `api.md` for documentation and usage.
//
bifs.exit = function(reason, ref) {
  var caller;
  var dest;
  var sig;

  if (typeof reason !== "string") {
    throw new Error("Argument `reason` must be of type String");
  }

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  sig = new ExitSig(caller.ref, reason);

  if (ref) {

    if (typeof ref === "string") {
      ref = resolveRef(ref);
    }

    if (ref instanceof LocalRef) {
      if ((ref = locals[ref.id])) {
        return exitLocal(ref, sig);
      } else {
        // Invalid local context.
        return false;
      }
    }

    return exitRemote(ref, sig);
  } else {
    return exitLocal(caller, sig);
  }
};


//
//  `"target"` MUST BE of type `LocalContext`. `"sender"` MUST BE of type
//  `Ref`.
//
function exitLocal(target, sig) {

  if (sig.reason !== "kill" && target.flags.trapExit) {
    return sendLocal(target, sig.toMsg());
  }

  if (target.fiber === Fiber.current) {
    throw sig;
  } else {
    process.nextTick(function() {
      if (target.id) {
        target.fiber.throwInto(sig);
      }
    });
  }

  return true;
}

function exitRemote(target, sender, reason) {
  // TODO
}


// Export all BIF's so it is available for other modules.
for (var bifname in bifs) {
  exports[bifname] = bifs[bifname];
}



function resolveRef(ref) {
  var splitted = ref.split("@");
  if (splitted.length == 1) {
    return namedRefs[splitted[0]];
  }
}



//
//  ### function uid([id]) **internal**
//
//  Handles allocation and release of Nodule ID references. Call with
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



function getServer() {

  if (server) {
    return server;
  }

  server = createServer();
  serverImplementationMethods(server);

  server.listen();
}


function serverImplementationMethods(server) {
  server.on("connection", function(sock) {
    sockImplementationMethods(sock);
    sock.on("connect", function() {
      sock.name;
    });
    sock.on("disconnect", function(nodename) {
      sock.name;
    });
  });
}

function nodeHandshakeImpl(op, buffer, start, end) {

  if (op !== 128) {
    this.destroy(new Error("Bad handshake"));
    return;
  }
  
}

function nodeMessageImpl(op, buffer, start, end) {
  var graph;

  try {
    graph = JSON.parse(buffer.toString("utf8", start, end));
  } catch (jsonException) {
    this.destroy(jsonException);
    return;
  }


  switch (op) {
    case 1: // spawn
      
      break;
    case 2: // link
      break;
      
    case 3: // send
      
      break;
  }
}

function nodeImplementationMethods(node) {
  var recvcallback;
  var buffer;
  var offset;
  var length;

  node.receive = nodeHandshakeImpl;

  node.ondata = function(chunk, start, end) {
    var sidebuffer;
    var msglen;
    var payload;
    var graph;

    if (buffer) {
      sidebuffer = new Buffer((length - offset) + (end - start));
      buffer.copy(sidebuffer, 0, offset, length);
      chunk.copy(sidebuffer, (length - offset), start, end);
      buffer = sidebuffer;
      length = buffer.length;
      offset = 0;
    } else {
      buffer = chunk;
      offset = start;
      length = end;
    }

    while (offset < length && !node.destroyed) {

      if (offset + 4 > length) {
        return;
      }

      msglen = (buffer[offset + 1] << 16 |
                buffer[offset + 2] << 8 |
                buffer[offset + 3]) + (buffer[0] << 24 >>> 0);

      if (offset + msglen > length) {
        return;
      }

      this.receive(buffer[offset + 4], buffer, offset + 5, offset + msglen);

      offset += msglen;
    }

    if (length - offset === 0) {
       buffer = null;
    }
  }

  node.on("error", function(err) {
    // Report this somehow.
  });
  node.on("close", function(hadError) {
    if (this.receive !== nodeHandshakeImpl) {
      node.emit("disconnect");
    }
  });
}



//
//  function compileNoduleSandbox(request, parent) **internal**
//
//  Creates and compiles a new Nodule Sandbox for
//  specified module.
//
function compileNoduleSandbox(request, parent) {
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

  for (var k in bifs) {
    sandbox[k] = bifs[k];
  }

  for (var k in global) {
    sandbox[k] = global[k];
  }

  sandbox.require = require;
  sandbox.exports = module.exports;
  sandbox.__filename = filename;
  sandbox.__dirname = path.dirname(filename);
  sandbox.module = module;
  sandbox.global = global;
  sandbox.root = root;

  return [target, function() { target.runInNewContext(sandbox); }];
}



//
//  ### constructor LocalContext(fiber)
//
//
function LocalContext(module, fiber) {

  this.id = uid();
  this.ref = new LocalRef(this.id);
  this.fiber = fiber;
  this.module = module;

  this.receiving = false;

  this.mailbox = null;
  this.mailboxSize = 0;

  this.timers = null;

  this.linksIn = null;
  this.linksOut = null;

  this.flags = {};

  Object.defineProperty(fiber, "__ref__", { value: this.ref });

  locals[this.id] = this;

  if (!LocalContext.timer) {
    LocalContext.timer = setInterval(function() {}, 10000);
    LocalContext.timer.referenceCount = 1;
  } else {
    LocalContext.timer.referenceCount++;
  }
}



//
//  ### function LocalContext.exit([sig])
//
//  Resets (destroys) this LocalCotnext instance with `"sig"`. 
//
LocalContext.prototype.reset = function(sig) {
  var ref = this.ref;
  var timers;
  var links;
  var linksout;
  var index;
  var linksig;

  uid(this.id);
  delete locals[this.id];

  if ((timers = this.timers)) {
    if (timers.length) {
      for (var i = 0, l = timers.length; i < l; i++) {
        clearTimeout(timers[i]);
      }
    } else {
      clearTimeout(timers);
    }
  }

  this.timers = null;

  if ((links = this.linksIn)) {
    linksig = ExitSig.fromSig(ref, sig);
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        unlinkLocal(links[i], this, linksig);
      }
    } else {
      unlinkLocal(links, this, linksig);
    }
  }

  if ((links = this.linksOut)) {
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        if (links[i] instanceof LocalContext) {
          unlinkLocal(this, links[i]);
        } else {
          unlinkRemote(this, links[i]);
        }
      }
    } else {
      if (links instanceof LocalContext) {
        unlinkLocal(this, links);
      } else {
        unlinkRemote(this, links);
      }
    }
  }

  delete this.fiber.__ref__;

  this.id = null;
  this.ref = null;
  this.fiber = null;
  this.flags = null;
  this.module = null;

  if (--LocalContext.timer.referenceCount == 0) {
    clearInterval(LocalContext.timer);
    LocalContext.timer = null;
  }

  console.log("Nodule %s terminated: %s", ref, sig);

  if (sig.reason == "error") {
    console.log(sig.stack);
  }
};



function LocalRef(id) {
  this.id = id;
  Object.freeze(this);
}

LocalRef.prototype.node = LOCAL_NODE;
LocalRef.prototype.inspect =
LocalRef.prototype.toString = function() {
  return ["<Nodule ", this.id, "@LOCAL>"].join("");
};

exports.LocalRef = LocalRef;

function RemoteRef(id, node) {
  this.id = id;
  this.node = node;
  Object.freeze(this);
}

exports.RemoteRef = RemoteRef;

RemoteRef.prototype.inspect =
RemoteRef.prototype.toString = function() {
  return ["<Nodule ", this.id, "@", this.node.name, ">"].join("");
};

//
//  ### NodeRef()
//
//  Represents a Node reference. This object is immutable.
//
function NodeRef(id) {
  this.id = id;
  Object.freeze(this);
}

exports.NodeRef = NodeRef;

//
//  ### NodeRef.toString()
//
//  Returns a String representation of this NodeRef instance.
//
NodeRef.prototype.inspect =
NodeRef.prototype.toString = function() {
  return "<Node " + (this.id == 0 ? "LOCAL" : this.id) + ">";
};



//
//  ### ExitSig(reason, sender)
//
//
function ExitSig(sender, reason) {
  this.sender = sender;
  if (reason instanceof Error) {
    this.reason = "error";
    this.message = reason.message;
    this.stack = reason.stack;
  } else {
    this.reason = reason;
  }
}

exports.ExitSig = ExitSig;

//
//  ### ExitSig.toMsg()
//
//  Returns a Msg representation of this ExitSig instance.
//
ExitSig.prototype.toMsg = function() {
  if (this.reason == "error") {
    return ["EXIT", this.sender, this.reason, [this.message, this.stack]];
  } else {
    return ["EXIT", this.sender, this.reason];
  }
};

//
//  ### ExitSig.toString()
//
//  Returns a String representation of this ExitSig instance.
//
ExitSig.prototype.inspect =
ExitSig.prototype.toString = function() {
  return "<ExitSig " + this.sender + " " + this.reason + ">";
};


ExitSig.fromSig = function (sender, sig) {
  var reason = sig.reason == "kill" ? "killed" : sig.reason;
  var newsig = new ExitSig(sender, sig.reason);
  if (sig.reason == "error") {
    newsig.message = sig.message;
    newsig.stack = sig.stack;
  }
  return newsig;
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
