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

var destinations = {};

function main() {
  process.argv.splice(1, 1);
  argv1 = process.argv[1];

  if (argv1.indexOf('/') !== -1 && argv1.charAt(0) !== '/') {
    process.argv[1] = path.join(process.cwd(), argv1);
  }

  new Modlet(process.argv[1], null);
}

var uid = (function() {
  var pool = new Array(ID_POOL_INITIAL_SIZE);
  var length = ID_POOL_INITIAL_SIZE;

  for (var i = 0; i < ID_POOL_INITIAL_SIZE; i++) {
    pool[i] = i + 1;
  }

  return function(id) {
    if (id !== undefined) {
      pool.push(id);
      length--;
    } else {

      if (!pool.length) {
        if (length + 1 == ID_POOL_MAX) {
          throw new Error("MAX_ID reached");
        }
        console.log("Increase uid pool" + length);
        for (var i = length + 1, l = (length * ID_POOL_INCREASE_STEP) + 1;
             i < l; i++) {
          pool.push(i);
        }
      }

      length++;
      return pool.shift();
    }
  };
})();


function spawnLocalProclet(fn) {
  var id = uid();
  var ref = genereateReference(LOCAL, id);
  var fiber;
  var mailbox;

  fiber = Fiber(function() {
    try {
      console.log("Exec" + fiber.__ref__);
      fn();
    } catch (execException) {
      console.log(execException.stack);
      // Report this somehow?
    } finally {
      console.log("Exec done" + fiber.__ref__);
      uid(id);
      delete destinations[ref];
    }
  });

  Object.defineProperty(fiber, "__ref__", { value: ref });

  function destination(msg) {
    if (destination.receiving) {
      fiber.run(msg);
    } else {
      queue = destination.queue;
      destination.size++;
      if (!queue) {
        destination.queue = queue = [];
      }
      queue.push(msg);
    }
  }

  destination.queue = null;
  destination.receiving = false;
  destination.size = 0;

  destinations[ref] = destination;

  if (mailbox)
  proclets[ref] = function(msg) {
    if ()
  };

  process.nextTick(function() {
    proclet.run();
  });

  return ref;
};


function genereateReference(hub, id) {
  var ref = [hub];
  id = id.toString(16);
  for (var i = id.length, i < 9; i++) {
    ref.push("0");
  }
  ref.push(id);
  return ref.join("");
}



//
//  ### function deliver() **internal**
//
function deliver(fromRef, toRef, message) {
  process.nextTick(function() {
    var dest = destinations[ref];
    if (dest) {
      dest(message);
    }
  });
}



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
  var me = Fiber.__ref__;
  var queue;
  var msg;
  var name;
  var fn;
  if ((queue = destinations[me].queue) && queue.length) {
    msg = queue.shift();
  } else {
    msg = Fiber.yield();
  }
  name = incomming.shift();
  for (var i = 0, l=arguments.length; i < arguments; i++) {
    fn = arguments[i];
    if (fn.name === name) {
      fn.apply(null, msg);
    }
  }
}



//
//  ### function send(ref, message) **built-in function**
//  Send's a message to `ref` proclet. The message is guaranteed
//  to be delivered, as long as the proclet is running.
//
//  #### Usage
//
//       /* Sends a message to self */
//       send(self(), ["ping"])
//
function sendImpl(ref, message) {
  var current = Fiber.current;
  if (ref === null) {
    return true;
  }
  if (typeof ref !== "string") {
    throw new Error("Invalid `ref`");
  }
  if (!(Array.isArray(msg))) {
    throw new Error("Expected `message` as `Array`");
  }
  return deliver(current.__ref__, ref, message);
}



//
//
//
function compileProcletSandbox(id, filename) {
  var sandbox = {};
  var dirname = path.dirname(filename);
  var target;
  var content;

  content = require('fs').readFileSync(filename, 'utf8');
  content = content.replace(/^\#\!.*/, '');

  target = createScript(content, filename);
  Module.call(target, id, null);
  target.filename = filename;

  if (process.argv[1] == filename) {
    target.id = ".";
  }

  function spawn(request) {
    var fn;
    var resolved;
    if (typeof request == "function") {
      return spawnLocalProclet(fn);
    } else {
      resolved = Module._resolveFilename(request, parent);
      fn = compileProcletSandbox.apply(null, resolved);
      return spawnLocalProclet(fn);
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
  sandbox.send = sendImpl;
  sandbox.require = require;
  sandbox.exports = module.exports;
  sandbox.__filename = filename;
  sandbox.__dirname = dirname;
  sandbox.module = module;
  sandbox.global = global;
  sandbox.root = root;

  return function() {
    target.runInNewContext(sandbox);
  };
}

function Mailbox() {
  Array.call(this);
  this._monitor = null;
}

inherits(Mailbox, Array);

Mailbox.prototype.append = function(msg) {
  var self = this;
  var monitor;

  if ((monitor = this._monitor) && !this.length) {
    process.nextTick(function() {
      monitor(msg);
    });
  } else {
    this.push(msg);
  }
};

Mailbox.prototype.checkMail = function() {
  var self = this;
  process.nextTick(function() {
    var monitor = self._monitor;
    if (monitor && self.length) {
      monitor(self.shift());
    }
  });
};

Mailbox.prototype.monitor = function(monitor) {
  var next;

  if (this.length) {
    next = this.shift();
    process.nextTick(function() {
      monitor(next);
    });
  } else {
    this._monitor = monitor;
  }
  // if (monitor && this.length) {
  //   process.nextTick(function() {
  //     monitor(self.shift());
  //   });
  //   this.checkMail();
  // }
};

function Ref(a, b, c) {
  this.a = a;
  this.b = b;
  this.c = c || 0;
}

Ref.prototype.toString = function() {
  var str;
  if (this.a === 0) {
    str =  "inproc://" + this.b + (this.c == 0 ? "" : "/" + this.c);
  } else {
    str = "inproc://" + this.b + (this.c == 0 ? "" : "/" + this.c);
  }
  return str;
};


if (process.mainModule === module) {
  main();
}