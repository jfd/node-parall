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

var REQUIRE = require;

var ID_POOL_MAX = 0xFFFFFF;
var ID_POOL_INITIAL_SIZE = 100;
var ID_POOL_INCREASE_STEP = 1.2;

var inherits = require("util").inherits;
var EventEmitter = require("events").EventEmitter;
var Module = require("module").Module;
var createScript = require("vm").createScript;
var path = require("path");
var inherits = require("util").inherits;
var createServer = require("net").createServer;

var KERNEL;
var LOCAL_NODE;
var contexts;
var namedContexts;
var server;
var namedRefs;
var nodules;
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
  var fn;

  if (LOCAL_NODE) {
    throw new Error("Parall is already initialized");
  }

  LOCAL_NODE = new NodeRef(0);
  KERNEL = new LocalNoduleRef(0);

  contexts = {};
  namedContexts = {};

  switch (typeof entrypoint) {
    case "function":
      nodule = spawnLocalNodule(entrypoint);
      break;
    case "string":
      fn = compileNoduleSandbox(entrypoint, null);
      nodule = spawnLocalNodule(fn);
      break;
    default:
      throw new Error("Expected a valid `entrypoint`");
  }

  return nodule;
};



exports.getKernelRef = function() {

  if (!KERNEL) {
    throw new Error("parall is not initialized");
  }

  return KERNEL;
};



//
//  ### function getRunningNoduleCtx([name]) **exported**
//
//  Returns the currently running Nodule context. 
//
exports.getRunningNoduleCtx = function() {
  var current = Fiber.current;
  var ref;
  var ctx;

  if (current && (ref = current.__ref__) && (ctx = contexts[ref])) {
    return ctx;
  }
};



//
//  ### function getContextByRef([ref]) **exported**
//
//  Returns the Context associated with `"ref"` or `null` if not exists.
//
exports.getContextByRef = function(ref) {
  return contexts[ref] || null;
};



//
//  ### function registerNamedContext(regname, ctx) **exported**
//
//
exports.registerNamedContext = function(regname, ctx) {

  if (ctx.name || namedContexts[regname]) {
    return false;
  }

  ctx.name = regname;
  namedContexts[regname] = ctx;

  return true;
};



//
//  ### function unregisterNamedContext(regname) **exported**
//
//
exports.unregisterNamedContext = function(regname) {
  var ctx;

  if (!(ctx = namedContexts[regname])) {
    return false;
  }

  ctx.name = null;
  namedContexts[regname] = null;

  return true;
};



//
//  ### function getNamedContext(regname) **exported**
//
//
exports.getNamedContext = function(regname) {
  return namedContexts[regname] || null;
};



//
//  ### function getNamedContextNames(regname) **exported**
//
//
exports.getNamedContextNames = function() {
  return Object.keys(namedContexts);
};



//
//  ### function send(dest, msg, options) **exported**
//
//  Sends `"`msg"` to "`dest`".
//
exports.send = function(dest, msg, options) {

  if (dest instanceof LocalNoduleRef) {
    return sendLocal(nodules[dest], msg, options);
  } 
  
  if (dest instanceof RemoteNoduleRef) {
    return sendRemote();
  } 
  
  if (typeof dest == "string") {
    dest = resolveRef(dest);
  }

  throw new Error("invalid `dest`");
};

function sendLocal(nodule, msg, options) {
  var mailbox;

  if (!nodule) {
    return false;
  }

  if (msg instanceof ExitSig) {
    if (msg.reason !== "kill" && this.flags.trapExit) {
      msg = msg.toMsg();
    } else {
      if (this.fiber === Fiber.current) {
        throw msg;
      } else {
        process.nextTick(function() {
          self.fiber && self.fiber.throwInto(msg);
        });
      }
      return;
    }
  }

  if (nodule.receiving) {
    process.nextTick(function() {
      nodule.fiber && nodule.fiber.run(msg);
    })
  } else {
    nodule.mailboxSize++;
    if (!(mailbox = nodule.mailbox)) {
      nodule.mailbox = [msg];
    } else {
      mailbox.push(msg);
    }
  }
  
}

function sendRemote(node, id, msg, options) {
  
}

function exit(sender, id, reason) {
  var context;
  var exitsig;

  if (!(nodule = nodules[id])) {
    return;
  }

  if (reason !== "kill" && context.flags.trapExit) {
    return sendLocal(context, ["EXIT", sender, reason]);
  }

  exitsig = new ExitSig();

  if (msg instanceof ExitSig) {
    if (msg.reason !== "kill" && this.flags.trapExit) {
      msg = msg.toMsg();
    } else {
      if (this.fiber === Fiber.current) {
        throw msg;
      } else {
        process.nextTick(function() {
          self.fiber && self.fiber.throwInto(msg);
        });
      }
      return;
    }
  }

}

function resetContext(ctx) {
  var ref = this.ref;
  var timers;
  var links;
  var linksout;
  var index;
  var linksig;

  sig = sig || new ExitSig(ref, "normal");

  uid(this.id);
  delete contexts[ref];

  if ((timers = this.timers)) {
    if (timers.length) {
      for (var i = 0, l = timers.length; i < l; i++) {
        clearTimeout(timers[i]);
      }
    } else {
      clearTimeout(timers);
    }
  }

  if ((links = this.linksIn)) {
    linksig = ExitSig.fromSig(ref, sig);
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        links[i].unlink(this);
        links[i].post(linksig);
      }
    } else {
      links.unlink(this);
      links.post(linksig);
    }
  }

  if ((links = this.linksOut)) {
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        links[i].unlink(this);
      }
    } else {
      links.unlink(this);
    }
  }

  if (this.name) {
    exports.unregisterNamedContext(this.name);
  }

  delete this.fiber.__ref__;

  this.timers = null;

  this.id = null;
  this.ref = null;
  this.fiber = null;
  this.name = null;
  this.flags = null;

  if (--LocalNoduleContext.timer.referenceCount == 0) {
    clearInterval(LocalNoduleContext.timer);
    LocalNoduleContext.timer = null;
  }

  console.log("Nodule %s terminated: %s", ref, sig);

  if (sig.iserror) {
    console.log(sig.stack);
  }
}


function kerneljob() {
  var msg;

  for (;;) {
    msg = receiveMessage();

    switch (msg[0]) {
      case "link":    link(msg[1], msg[2]); break;
      case "unlink":  unlink(msg[1], msg[2]); break;
      case "exit":    exit(msg[1], msg[2], msg[2]); break;
      case "":
        break;
    }
  }

}


function resolveRef(ref) {
  var splitted = req.splt("@");
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

function nodeHandshakeImpl(graph) {

  if (op !== 128) {
    this.destroy(new Error("Bad handshake"));
    return;
  }
  
}

function nodeMessageImpl(op, payload) {
  var graph;

  try {
    graph = JSON.parse(payload);
  } catch (jsonException) {
    this.destroy(jsonException);
    return;
  }

  switch (op) {
    case 1: // spawn
      
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

      try {
        payload = buffer.toString("utf8", offset + 4, offset + msglen);
        graph = JSON.parse(payload);
      } catch (jsonException) {
        this.destroy(jsonException);
        return;
      }

      this.receive(graph);

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
//  ### function spawnLocalNodule(fn) **internal**
//
//  Spawn creates a new Nodule, which is immediately started. The
//  reference to the newly spawned Nodule is returned.
//
function spawnLocalNodule(fn) {
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
        sig = ExitSig.fromError(context.ref, signal);
      }
    } finally {
      context.exit(sig);
    }
  });

  context = new LocalNoduleContext(fiber);

  process.nextTick(function() {
    fiber.run();
  });

  return context.ref;
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
  var bifs;

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
        return spawnLocalNodule(entrypoint);
      case "string":
        fn = compileNoduleSandbox(entrypoint, target);
        return spawnLocalNodule(fn);
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

  bifs = REQUIRE("./bif");

  for (var k in bifs) {
    sandbox[k] = bifs[k];
  }

  for (var k in global) {
    sandbox[k] = global[k];
  }


  sandbox.spawn = spawn;
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
//  ### constructor LocalNoduleContext(fiber)
//
//
function LocalNoduleContext(fiber) {

  this.id = uid();
  this.ref = new NoduleRef(this.id, LOCAL_NODE);
  this.fiber = fiber;

  this.name = null;

  this.receiving = false;

  this.mailbox = null;
  this.mailboxSize = 0;

  this.timers = null;

  this.linksIn = null;
  this.linksOut = null;

  this.flags = {};

  Object.defineProperty(fiber, "__ref__", { value: this.ref });

  contexts[this.ref] = this;

  if (!LocalNoduleContext.timer) {
    LocalNoduleContext.timer = setInterval(function() {}, 10000);
    LocalNoduleContext.timer.referenceCount = 1;
  } else {
    LocalNoduleContext.timer.referenceCount++;
  }
}



//
//  ### function LocalNoduleContext.waitForMessage(trapExit)
//
//  Put's the context in receive-mode
//
LocalNoduleContext.prototype.waitForMessage = function(trapExit) {
  var queue;
  var msg;

  if ((queue = this.queue) && queue.length) {
    msg = queue.shift();
    this.mailboxSize--;
  } else {
    this.receiving = true;
    msg = Fiber.yield();
    this.receiving = false;
  }

  return msg;
};



//
//  ### function LocalNoduleContext.startTimer(delay, dest, msg)
//
//  Sends `"msg"` to `"dest"` after `"delay"`.
//
LocalNoduleContext.prototype.startTimer = function(delay, dest, msg) {
  var self = this;
  var me = this.ref;
  var timers;
  var id;

  function callback() {
    var destination = contexts[dest];
    self.cancelTimer(id);
    if (destination) {
      destination.post(msg);
    }
  }

  id = setTimeout(callback, delay);

  if ((timers = this.timers)) {
    if (timers.length) {
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
//  ### function LocalNoduleContext.cancelTimer(id)
//
//  Cancel timer of `"id"`.
//
LocalNoduleContext.prototype.cancelTimer = function(id) {
  var timers;
  var index;

  if (!id || !(timers = this.timers)) {
    return false;
  }

  if (timers.length) {
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
//  ### function LocalNoduleContext.link(ctx)
//
//  Link Nodule ctx with `"target"` ctx.
//
LocalNoduleContext.prototype.link = function(ctx) {
  var links;

  if ((links = this.linksOut)) {
    if (links.length) {
      links.push(ctx);
    } else {
      this.linksOut = [links, ctx];
    }
  } else {
    this.linksOut = ctx;
  }

  if ((links = ctx.linksIn)) {
    if (links.length) {
      links.push(this);
    } else {
      ctx.linksIn = [links, this];
    }
  } else {
    ctx.linksIn = this;
  }

  return true;
};



//
//  ### function LocalNoduleContext.unlink(ctx)
//
//  Unlink Nodule ctx from `"ctx"` context.
//
LocalNoduleContext.prototype.unlink = function(ctx) {
  var links;
  var index;

  if ((links = this.linksOut) && links.length) {
    index = links.indexOf(ctx);
    if (index === -1) {
      return false;
    }
    links.splice(index, 1);
    this.linksOut = links.length && links || null;
  } else {
    if (this.linksOut !== ctx) {
      return false;
    }
    this.linksOut = null;
  }

  if ((links = ctx.linksIn) && links.length) {
    index = links.indexOf(this);
    links.splice(index, 1);
    this.linksIn = links.length && links || null;
  } else {
    ctx.linksIn = null;
  }

  return true;
};



//
//  ### function LocalNoduleContext.exit([sig])
//
//  Destroys the ctx with `"sig"`. 
//
LocalNoduleContext.prototype.exit = function(sig) {
  var ref = this.ref;
  var timers;
  var links;
  var linksout;
  var index;
  var linksig;

  sig = sig || new ExitSig(ref, "normal");

  uid(this.id);
  delete contexts[ref];

  if ((timers = this.timers)) {
    if (timers.length) {
      for (var i = 0, l = timers.length; i < l; i++) {
        clearTimeout(timers[i]);
      }
    } else {
      clearTimeout(timers);
    }
  }

  if ((links = this.linksIn)) {
    linksig = ExitSig.fromSig(ref, sig);
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        links[i].unlink(this);
        links[i].post(linksig);
      }
    } else {
      links.unlink(this);
      links.post(linksig);
    }
  }

  if ((links = this.linksOut)) {
    if (links.length) {
      for (var i = 0, l = links.length; i < l; i++) {
        links[i].unlink(this);
      }
    } else {
      links.unlink(this);
    }
  }

  if (this.name) {
    exports.unregisterNamedContext(this.name);
  }

  delete this.fiber.__ref__;

  this.timers = null;

  this.id = null;
  this.ref = null;
  this.fiber = null;
  this.name = null;
  this.flags = null;


  if (--LocalNoduleContext.timer.referenceCount == 0) {
    clearInterval(LocalNoduleContext.timer);
    LocalNoduleContext.timer = null;
  }

  console.log("Nodule %s terminated: %s", ref, sig);

  if (sig.iserror) {
    console.log(sig.stack);
  }
};



//
//  ### ContextRef()
//
//  Represents a Context reference. 
//
function ContextRef(id) {
  this.id = id;
};

exports.ContextRef = ContextRef;



//
//  ### NoduleRef()
//
//  Represents a Nodule reference. This object is immutable.
//
function NoduleRef(id, node) {
  ContextRef.call(this, id);
  this.node = node;
  Object.freeze(this);
}

exports.NoduleRef = NoduleRef;
inherits(NoduleRef, ContextRef);

//
//  ### NoduleRef.toString()
//
//  Returns a String representation of this ContextRef instance.
//
NoduleRef.prototype.toString = function() {
  return [ "<Nodule "
         , this.id
         , "@"
         , (this.node.id == 0 ? "LOCAL" : this.id)
         , ">"].join("");
};

NoduleRef.prototype.inspect = NoduleRef.prototype.toString;


function LocalNoduleRef(id) {
  this.id = id;
  Object.freeze(this);
}

LocalNoduleRef.prototype.node = LOCAL_NODE;
LocalNoduleRef.prototype.inspect =
LocalNoduleRef.prototype.toString = function() {
  return ["<Nodule ", this.id, "@LOCAL>"].join("");
};


function RemoteNoduleRef(id, node) {
  this.id = id;
  this.node = node;
  Object.freeze(this);
}

RemoteNoduleRef.prototype.inspect =
RemoteNoduleRef.prototype.toString = function() {
  return ["<Nodule ", this.id, "@", this.node.name, ">"].join("");
};

//
//  ### NodeRef()
//
//  Represents a Node reference. This object is immutable.
//
function NodeRef(id) {
  ContextRef.call(this, id);
  Object.freeze(this);
}

exports.NodeRef = NodeRef;
inherits(NodeRef, ContextRef);

//
//  ### NoduleRef.toString()
//
//  Returns a String representation of this ContextRef instance.
//
NodeRef.prototype.toString = function() {
  return "<Node " + (this.id == 0 ? "LOCAL" : this.id) + ">";
};

NodeRef.prototype.inspect = NodeRef.prototype.toString;



//
//  ### ExitSig(reason, sender)
//
//
function ExitSig(sender, reason) {
  this.reason = reason;
  this.sender = sender;
  this.iserror = false;
  this.stack = null;
}

exports.ExitSig = ExitSig;

ExitSig.prototype.encode = function() {
  return {$ExitSig: { reason: this.reason
                    , sender: this.sender
                    , iserror: this.iserror
                    , stack: this.stack
                    }};
};

//
//  ### ExitSig.toMsg()
//
//  Returns a Msg representation of this ExitSig instance.
//
ExitSig.prototype.toMsg = function() {
  if (this.iserror) {
    return ["EXIT", msg.sender, "error", [msg.reason, msg.stack]];
  } else {
    return ["EXIT", msg.sender, msg.reason];
  }
};

//
//  ### ExitSig.toString()
//
//  Returns a String representation of this ExitSig instance.
//
ExitSig.prototype.toString = function() {
  return "<ExitSig " + this.sender + " " + this.reason + ">";
};

ExitSig.prototype.inspect = ExitSig.prototype.toString;

ExitSig.fromError = function (sender, error) {
  var sig = new ExitSig(sender, error.message);
  sig.iserror = true;
  sig.stack = error.stack || null;
  return sig;
};

ExitSig.fromSig = function (sender, sig) {
  var reason = sig.reason == "kill" ? "killed" : sig.reason;
  var sig = new ExitSig(sender, sig.reason);
  sig.iserror = sig.iserror;
  sig.stack = sig.stack;
  return sig;
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
