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

var KERNEL_VERSION    = "0.6.0";

var DEFAULT_PATH      = "/var/run/parall";
var DEFAULT_PORT      = 42000;

var BIFS = null;

var ID_POOL_MAX = 0xFFFF;
var ID_POOL_INITIAL_SIZE = 100;
var ID_POOL_INCREASE_STEP = 1.2;

var Script            = process.binding('evals').Script;
var runInThisContext  = Script.runInThisContext;
var runInNewContext   = Script.runInNewContext;

var path              = require('path');

var inherits          = require("util").inherits
  , EventEmitter      = require("events").EventEmitter
  , Module            = require("module").Module
  , inherits          = require("util").inherits
  , createServer      = require("net").createServer
  , overload          = require("./ext").overload
  , getopt            = require("./ext").getopt
  , hasopt            = require("./ext").hasopt
  , getarg            = require("./ext").getarg;


var LOCAL_NODE = new NodeRef(0);
var NOMATCH = {};

var bifs = {};

var locals;
var nodes;
var namedRefs;
var namedRefsRev;


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
exports.initialize = function(module, name, args, opts) {
  var loader;

  if (typeof module !== "string") {
    throw new Error("bad argument, `module`");
  }

  module = require.resolve(module);

  if (!Array.isArray(args)) {
    throw new Error("bad argument, `args`");
  }

  if (typeof opts !== "object") {
    throw new Error("bad argument, `options`");
  }

  if (locals) {
    throw new Error("Parall is already initialized");
  }

  kernel = new Kernel();

  locals = {};
  namedRefs = {};
  namedRefsRev = {};

  opts.startup = [module, name || "start", args];
  opts.port = opts.port || DEFAULT_PORT;
  opts.path = opts.path || DEFAULT_PATH;

  spawnLocal(module, kerneljob, [kernel, opts]);
};



function Kernel() {
  this.locals = {};
  this.namedRefs = {};
  this.namedRefsRev = {};
}

Kernel.prototype.startTimer = function() {
  
};

Kernel.prototype.registerNode = function() {
  
};


Kernel.prototype.unregisterNode = function() {
  
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
}



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
};

var KERNEL_SERVICES = ["bootloader", "net_serv", "log_serv"];

function kerneljob(kernel, opts) {
  var msg;
  var name;
  var from;

  bifs.register("kernel", bifs.self());

  parallRequire(require.resolve("./boot_loader")).start(opts);

  while (kernel) {

    msg = bifs.receive();

    switch (msg[0]) {

      case "_registerService":
        name = msg[1];
        from = msg[2];

        if (!namedRefs[name] && KERNEL_SERVICES.indexOf(name) != -1) {
          bifs.register(name, from);
          bifs.send(from, ["regok", kernel]);
        } else {
          bifs.send(from, ["regerr", "bad_service"]);
        }
        break;

      case "_shutdown":

        break;
    }
  }
}


exports.bifs = bifs;
overload(bifs, "node");



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
//  ### function node([ref]) **built-in function** **overloaded**
//
//  See `BIF/node` in `api.md` for documentation and usage.
//
bifs.node = function() { return LOCAL_NODE; };
bifs.node = function(ref) {
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
bifs.spawn = function(parent, module, fn, args) {

  args = args || [];

  if (parent instanceof NodeRef) {
    return spawnRemote(parent, module, fn, args);
  } else {

    if (typeof module == "string") {
      module = parallRequire(module, parent);
    }

    if (typeof fn == "string" && !(fn = module[fn])) {
      throw new Error("invalid fn `" + fn + "/" + args.length + "`");
    }

    return spawnLocal(module, fn, args);
  }
};



//
//  ### function spawnLocal(module, fn) **internal**
//
//  Spawn creates a new Nodule, which is immediately started. The
//  reference to the newly spawned Nodule is returned.
//
function spawnLocal(module, fn, args) {
  var fiber;
  var sig;
  var context;

  fiber = Fiber(function() {
    try {
      fn.apply(module, args);
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
  var patterns;
  var nomatch;
  var queue;
  var m;

  if (!(caller = getCallingContext())) {
    throw new Error("called outside nodule");
  }

  if (arguments.length) {
    patterns = collectPatterns(arguments);

    nomatch = true;

    function findmatch(msg) {
      var callback;

      function getcallbackfor(name, off) {
        var pattern;
        var count;
        var fn;

        if ((pattern = patterns[name])) {
          if ((fn = pattern[msg.length - off])) {
            return function() {
              return fn.apply(pattern, off ? msg.slice(off) : msg);
            };
          } else {
            count = msg.length - off;
            while (!(fn = pattern[count--]) && count > -1) { }
            if (fn) {
              return function() {
                return fn.apply(pattern, off ? msg.slice(off) : msg);
              };
            }
          }
        }
      }

      return getcallbackfor(msg[0], 1) || getcallbackfor("", 0) || null;
    }

    if ((queue = caller.mailbox) && queue.length) {
      for (var i = 0, l = queue.length; i < l; i++) {
        if ((m = findmatch(queue[i]))) {
          queue.splice(i, 1);
          caller.mailboxSize--;
          return m();
        }
      }
    }

    while (true) {
      caller.receiving = true;
      msg = Fiber.yield();
      caller.receiving = false;
      if ((m = findmatch(msg))) {
        return m();
      } else {
        caller.mailboxSize++;
        caller.mailbox ? caller.mailbox.push(msg) :
                         caller.mailbox = [msg];
      }
    }

  } else {
    caller.receiving = true;
    msg = Fiber.yield();
    caller.receiving = false;
    return msg;
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
}

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
      return linkLocal(caller, ref);
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
    if (!dest) {
      return true;
    }
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
    if (!(mailbox = target.mailbox)) {
      target.mailbox = [msg];
    } else {
      mailbox.push(msg);
    }
    target.mailboxSize++;
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



function resolveRef(ref) {
  var splitted = ref.split("@");
  if (splitted.length == 1) {
    return namedRefs[splitted[0]];
  }
}


//
// Helper wrapper.
//
var wrapScriptContent = function(content) {
  var natives = ["exports", "require", "module", "__filename", "__dirname"];
  var all = natives.concat(Object.keys(bifs));
  var wrapper = ['(function (' + all.join(",") + ') { ', '\n});'];
  wrapScriptContent = function(content) {
    return [wrapper[0], content, wrapper[1]].join("");
  };
  return wrapScriptContent(content);
};

function parallRequire(request, parent) {
  var resolved = Module._resolveFilename(request, parent);
  var id = resolved[0];
  var filename = resolved[1];
  var ctx;
  var cachedModule;
  var module;

  if (id[0] !== "/" && id[0] !== "\\") {
    // Native modules should never be loaded with parallRequire. We
    // therefor need to find out if request is a native module or
    // not. Node doesn't let us see `NativeModule.exists` so we need
    // to do this little hack. 

    return require(request);
  }

  function doload(throwerr) {
    var callbacks = module._loadingCallbacks;
    var err;
    var exports;

    if (module.loaded) {
      return;
    }

    try {
      module.load(filename);
    } catch (loadErr) {
      delete Module._cache[filename];
      err = loadErr;
    }

    if (callbacks) {
      delete module._loadingCallbacks;
      for (var i = 0, l = callbacks.length; i < l; i++) {
        callbacks[i](err, module.exports);
      }
    }

    if (err && throwerr) {
      throw err;
    }

    return module.exports;
  }

  cachedModule = Module._cache[filename];

  if (cachedModule) {
    if (cachedModule._loadingCallbacks) {
      module = cachedModule;
      return doload(true);
    }
    return cachedModule.exports;
  }

  module = new ParallModule(id, parent);

  Module._cache[filename] = module;

  if ((ctx = getCallingContext())) {

    if (!module._loadingCallbacks) {
      module._loadingCallbacks = [];
      process.nextTick(doload);
    }

    module._loadingCallbacks.push(function (err, exports) {
      if (ctx.id) {
        if (err) {
          ctx.fiber.throwInto(err);
        } else {
          ctx.fiber.run(exports);
        }
      }
    });

    return Fiber.yield();
  }

  return doload(true);
}


function wrapSpawn(parent) {
  var spawn = bifs.spawn;
  var o = {};

  overload(o, "spawn");

  o.spawn = function(fn) {
    if (typeof fn == "string") {
      return this(fn, "start", []);
    } else {
      return this(parent, parent, fn, []);
    }
  };
  o.spawn = function(fn, args) {
    if (typeof fn == "string") {
      if (typeof args == "string") {
        return this(fn, args, []);
      } else {
        return this(fn, "start", args);
      }
    } else {
      return spawn(parent, parent, fn, args);
    }
  };
  o.spawn = function(module, fn, args) {
    return spawn(parent, module, fn, args);
  };
  o.spawn = function(node, module, fn, args) {
    return spawn(node, module, fn, args);
  };

  return o.spawn;
};



function ParallModule(id, parent) {
  Module.call(this, id, parent);
}

exports.ParallModule = ParallModule;
inherits(ParallModule, Module);

ParallModule.prototype._compile = function(content, filename) {
  var self = this;
  var wrappedSpawn;

  content = content.replace(/^\#\!.*/, '');

  // add coverage
  if (process.cov) {
    var lines = content.split('\n');

    if (lines.length > 0) {
      lines[0] = '__cov[__filename] = { 0: true}; ' + lines[0];
    }

    for (var i = 0; i < lines.length; i++) {
     lines[i] =
      lines[i].replace(/;$/, '; __cov[__filename][' + i + '] = true;');
    }

    content = lines.join('\n');
  }

  function require(path) {
   return parallRequire(path, self);
  }

  require.resolve = function(request) {
    return Module._resolveFilename(request, self)[1];
  }

  require.paths = Module._paths;
  require.main = process.mainModule;
  require.extensions = Module._extensions;
  require.cache = Module._cache;

  var dirname = path.dirname(filename);

  wrappedSpawn = wrapSpawn(self);

  if (Module._contextLoad) {
    var sandbox = {};

    for (var k in global) {
     sandbox[k] = global[k];
    }

    for (var k in bifs) {
      sandbox[k] = bifs[k];
    }

    sandbox.spawn = wrappedSpawn;
    sandbox.require = require;
    sandbox.exports = self.exports;
    sandbox.__filename = filename;
    sandbox.__dirname = dirname;
    sandbox.module = self;
    sandbox.global = sandbox;
    sandbox.root = root;

    return runInNewContext(content, sandbox, filename, true);
  }

  var wrapper = wrapScriptContent(content);

  var compiledWrapper = runInThisContext(wrapper, filename, true);

  if (filename === process.argv[1] && global.v8debug) {
    global.v8debug.Debug.setBreakPoint(compiledWrapper, 0, 0);
  }

  if (!BIFS) {
    var BIFS = Object.keys(bifs).map(function(k) { return bifs[k] });
  }

  var args = [self.exports, require, self, filename, dirname].concat(BIFS);
  var index = args.indexOf(bifs.spawn);
  args[index] = wrappedSpawn;
  return compiledWrapper.apply(self.exports, args);
};


//
//  ### NodeContext
//
function NodeContext(name, host) {

  this.id = NodeContext.uid();
  this.name = name;
  this.host = host;
  this.ref = new NodeRef(this.id, name, host);
  this.stream = null;

  // Available ready states are "disconnected", "connected", "closing"
  this.readystate = "disconnected";
}


NodeContext.prototype.disconnect = function() {
};


//
//  ### NodeContext.uid([id])
//
//  Allocates and returns next free NodeContext id if `"id"` is not
//  set. Deallocates a used ID if `"id`" is set.
//
NodeContext.uid = (function() {
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



NodeContext.prototype.reset = function() {

  NodeContext.uid(this.id);

  this.id = null;
  this.ref = null;
  this.strem = null;

  this.readystate = "disconnected";
};



//
//  ### constructor LocalContext(fiber)
//
//
function LocalContext(module, fiber) {

  this.id = LocalContext.uid();
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
//  ### LocalContext.uid([id])
//
//  Allocates and returns next free LocalContext id if `"id"` is not
//  set. Deallocates a used ID if `"id`" is set.
//
LocalContext.uid = (function() {
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

  LocalContext.uid(this.id);
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

  if (sig.reason == "error") {
    console.log("Nodule %s terminated: %s", ref, sig);
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
  this.name = this.name;
  this.host = this.host;
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


function showusage() {
  console.log("usage: parall [module] [func] [arg1, arg2, ...] [OPTIONS]");
  process.exit(1);
}



function showhelp() {
  var h = [];
  h[h.length] = "usage: parall [module] [func] [arg1, arg2, ...] [OPTIONS]";
  h[h.length] = "";
  h[h.length] = "Available options:";
  h[h.length] = "  -h, --help               Shows this help section";
  h[h.length] = "  -v, --verbose            Verbose mode";
  h[h.length] = "    , --usage              Show Parall cmd-tool usage";
  h[h.length] = "    , --version            Show version of Parall";
  h[h.length] = "    , --port[=42000]       Set's the port to master node";
  h[h.length] = "    , --host[=*]           Set's the port to master node";
  h[h.length] = "  -n, --name               Sets the name of the node";
  h[h.length] = "";
  h[h.length] = "Environment variables:";
  console.log(h.join("\n"));
  process.exit(1);
}



function showversion() {
  console.log(KERNEL_VERSION);
  process.exit(1);
}



//
//  Entry-point for new kernels.
//
function run(argv) {
  var opts = {};
  var args = [];

  argv.forEach(function(arg) {
    var m = arg[0] == "-" ? arg.split("=") : arg;
    switch (m[0]) {
      case "-n": case "--name": opts.name = m[1]; break;
      case "-h": case "--help": showhelp(); return;
      case "--port": opts.port = parseInt(m[1]); break;
      case "-v": case "--verbose": opts.verbose = true; break;
      case "--host": opts.host = m[1]; break;
      case "--usage": showusage(); return;
      case "--version": showversion(); return;
      default: args.push(arg);
    }
  });

  if (args.length) {

    if (args[0].indexOf('/') !== -1 &&
        args[0].charAt(0) !== '/') {
      args[0] = path.join(process.cwd(), args[0]);
    }

    if (args.length == 1) {
	    return exports.initialize(args[0], "start", [], opts);
    } else {
	    return exports.initialize(args[0], args[1], args.slice(2), opts);
    }

    return
  }

  return exports.initialize("./repl", "start", [], opts);
}


//
//  Initialize Parall Environment if module is mainModule.
//
if (process.mainModule === module) {
  run(process.argv.slice(2));
}
