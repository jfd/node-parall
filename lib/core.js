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

var MAX_RUNLETS = 10000;
var INITIAL_POOL_SIZE = 100;

var inherits = require("util").inherits;
var Module = require("module").Module;
var createScript = require("vm").createScript;
var path = require("path");
var inherits = require("util").inherits;

var mailboxes = {};
var workers = {};

function main() {
  process.argv.splice(1, 1);
  argv1 = process.argv[1];

  if (argv1.indexOf('/') !== -1 && argv1.charAt(0) !== '/') {
    process.argv[1] = path.join(process.cwd(), argv1);
  }

  new Modlet(process.argv[1], null);
}

var uid = (function() {
  var pool = new Array(INITIAL_POOL_SIZE);
  var length = INITIAL_POOL_SIZE;

  for (var i = 0; i < INITIAL_POOL_SIZE; i++) {
    pool[i] = i + 1;
  }

  return function(id) {
    if (id !== undefined) {
      pool.push(id);
      length--;
    } else {

      if (!pool.length) {
        if (length + 1 == MAX_RUNLETS) {
          throw new Error("MAX_RUNLETS reached");
        }
        console.log("Increase uid pool" + length);
        for (var i = length + 1, l = length + 51; i < l; i++) {
          pool.push(i);
        }
      }

      length++;
      return pool.shift();
    }
  };
})();

function Funlet(runnable, parent) {
  this.id = uid();
  workers[this.id] = execRunnable(this.id, runnable);
}

Funlet.prototype.getRef = function() {
  return new Ref(0, this.id);
};


function Modlet(request, parent) {
  var self = this;
  var resolved = Module._resolveFilename(request, parent);
  var runnable;

  this.id = uid();

  runnable = compileModlet.apply(null, resolved);

  workers[this.id] = execRunnable(this.id, runnable);
}

Modlet.prototype.getRef = function() {
  return new Ref(0, this.id);
};
// setInterval(function() {
//   console.log(Object.keys(workers).length);
// }, 1000);

function receiveImpl() {
  var fiber = Fiber.current;
  var msg;
  fiber.__receivemode__ = true;
  msg = Fiber.yield();
  arguments[0].apply(null, msg);
}

function sendImpl(ref, msg) {
  var mb;

  if (ref === null) {
    return true;
  }

  // if (!(ref instanceof Ref)) {
  //   throw new Error("Expected ref as Ref");
  // }

  if (ref.a == 0) {
    fiber = workers[ref.b];

    if (!fiber) {
      throw new Error("Invalid Ref");
    }
    
    if (fiber.__receivemode__) {
      fiber.__receivemode__ = false;
      process.nextTick(function() {
        fiber.run(msg);
      });
    } else {
      mailbox = getMailboxFor(ref);
      mailbox.push(msg);
    }
    // fiber.__mb__.append(msg);
    return true;
  }
}

function getMailboxFor(ref) {
  var mailbox;
  
  // if (!(mailbox = mailbox[ref.b])) {
  //   
  // }
  
  return mailbox;
}

function self() {
  var fiber = Fiber.current;
  return new Ref(0, fiber.__id__);
}

function execRunnable(id, runnable) {
  var fiber;

  fiber = Fiber(function() {
    try {
      runnable();
    } catch (execException) {
      console.log(execException.stack);
      // Report this somehow?
    } finally {
      uid(fiber.__id__);
      delete workers[fiber.__id__];
      // // try { fiber.reset(); } catch (e) {
      // //   console.log(e.stack);
      // // }
      // fiber = null;
    }
  });

  Object.defineProperty(fiber, "__id__", { value: id });
  fiber.__mb__ = new Mailbox();

  process.nextTick(function() {
    fiber.run();
  });

  return fiber;
}

function compileModlet(id, filename) {
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
    var newlet;
    if (typeof request == "function") {
      newlet = new Funlet(request, target);
    } else {
      newlet = new Modlet(request, target);
    }
    return newlet.getRef();
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

  sandbox.self = self;
  sandbox.spawn = spawn;
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