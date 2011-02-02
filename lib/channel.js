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

const Buffer                = require("buffer").Buffer
    , EventEmitter          = require("events").EventEmitter
    , inherits              = require("util").inherits
    , parseUrl              = require("url").parse
    , timers                = require('timers').active
    , notEqual              = require("assert").notEqual
    , createDynamic         = require("./chaining").createDynamic
    , isDynamic             = require("./chaining").isDynamic
    , parseDynamics         = require("./chaining").parseDynamics
    , Matcher               = require("./matching").Matcher
    , getString             = require("./encoding").getString

const slice                 = Array.prototype.slice;
    
const recvMsg               = process.binding("net").recvMsg
    , socket                = process.binding("net").socket
    , bind                  = process.binding("net").bind
    , connect               = process.binding("net").connect
    , listen                = process.binding("net").listen
    , accept                = process.binding("net").accept
    , close                 = process.binding("net").close;

const IOWatcher             = process.binding('io_watcher').IOWatcher;

const createMessage         = require("./message").createMessage
    , sendImpl              = require("./message").sendImpl
    
const ResponderSocket       = require("./socket").ResponderSocket
    , RequesterSocket       = require("./socket").RequesterSocket
    , SubscriberSocket      = require("./socket").SubscriberSocket
    , PublisherSocket       = require("./socket").PublisherSocket;

const createProcSockAlias   = require("./utils").createProcSockAlias

const ENOENT                = process.binding('constants').ENOENT
    , EMFILE                = process.binding('constants').EMFILE

// Option Types
const SUBSCRIBE             = 0x01
    , UNSUBSCRIBE           = 0x02
    , INCLUDE               = 0x03
    , EXCLUDE               = 0x04
    
const DEFAULT_TCP_PORT      = 7010;
    
const SQ_FLUSH_INTERVAL     = 300;

// Supported Transport Protocols    
const SUPPORTED_PROTOCOLS   = exports.SUPPORTED_PROTOCOLS = ["tcp:", 
                                                             "proc:", 
                                                             "sock:"];

// Enable support for MemStream, if possible.
try { 
  const MemStream = require("memstream").MemStream;
  const MemServer = require("memstream").MemServer;
  SUPPORTED_PROTOCOLS.push("mem:");
} catch(e){ }

var requestTimeoutHandles   = {};


/**
 *  ### messaging.send(...)
 *
 *  The chainable version of `'channel.send'´ and `'message.send'`. The  
 *  function can be used in two ways, either in chaining mode or by passing 
 *  the channel/message as the context.
 *
 *  Message's sent with this function is automatically encoding using 
 *  channels prefered `encoding` method. Respones is also decoded using
 *  the same method.
 *
 *  Example using `send` with `json` as encoding;
 *  
 *      var channel = createChannel("req");
 *      channel.encoding = "json";
 *      send(channel, "ping", "message", function(a, b) {
 *        console.log(a); // "pong"
 *        console.log(b); // "message"
 *      });
 *
 *  Example using in a chain:
 *
 *      channel.on("message", mmatch( 
 *        when ("ping", String) (
 *          send("pong", $(0))
 *        ) 
 *      ));
 *
 *  Example using with context:
 *
 *      channel.on("message", function(msg) {
 *        var graph = decode(msg, "json");
 *        if (graph[0] == "ping") {
 *          send.call(msg, "pong", graph[1]);
 *        }
 *      });
 */
exports.send = function() {
  var graph = Array.prototype.slice.call(arguments);
  var lastarg = graph[graph.length - 1];
  var inargs;
  var ctx;
  var payload;
  var sendcallback;
  var usercallback;
  
  if (typeof lastarg == "function" &&
      !isDynamic(lastarg)) {
    usercallback = graph.pop();
    sendcallback = function(msg) {
      var graph = decode(msg, ctx.encoding);
      usercallback.apply(null, Array.isArray(graph) && graph || [graph]);
    }
    sendcallback._init = usercallback._init;
  }

  if ((typeof graph[0].send == "function" && (ctx = graph.shift())) ||
      (typeof this.send == "function" && (this.send != exports.send) && 
      (ctx = this))) {
    inargs = [];
    payload = encode(parseDynamics(inargs, graph), ctx.encoding);
    payload._fd = inargs._fd;
    ctx.send(payload, sendcallback);
  } else {
    return function(args) {
      var payload;
      if (!this || typeof this.send != "function") {
        throw new Error("Context is not a channel or message.");
      }
      payload = encode(parseDynamics(args, graph), this.encoding);
      this.send(payload, sendcallback);
      return args;
    }
  }
}

/**
 *  ### messaging.ok()
 *
 *  The chainable version of `'message.ok'´. The function can be used 
 *  in two ways, either by passing it to a ´chain` or by passing the message to
 *  reply to in context.
 *
 *  Example using in a chain:
 *
 *      channel.on("message", mmatch( 
 *        when ("ping") (
 *          ok
 *        ) 
 *      ));
 *
 *  Example using with context:
 *
 *      channel.on("message", function(msg) {
 *        var graph = decode(msg, "json");
 *        if (graph[0] == "pong") {
 *          ok.call(msg);
 *        }
 *      });
 */
exports.ok = function() {
  
}

/**
 *  ### messaging.Fd(stream) **dynamic**
 *
 *  Sends a file-descriptor from a `'stream'` along with the message.
 *
 *  Example:
 *    
 *      channel = createChannel("master");
 *      channel.encoding = "json";
 *      channel.bind("sock://workers");
 *      send(channel, "take-control-of", Fd(stream), function(msg) {
 *        if (msg.toString() == "ok") {
 *          console.log("The FD was over-taken by remote");
 *        } else {
 *          console.log("The FD was NOT over-taken by remote");
 *        }
 *      });
 *
 *  Note: This feature is only supported by channels bound to the two 
 *  unix-protocol's, `sock` and `proc`.
 *
 *  See also: release(stream)
 */
exports.Fd = function(stream) {
  var stream;
  var value;
  var result;
  
  if (arguments.length == 2) {
    // Do custom matching
    value = arguments[0];
    result = arguments[1];
    if (value && value.fd && this._fd) {
      result.push(this._fd);
      return true;
    }
    
  } else {
    // Return dynamic
    
    stream = arguments[0];

    if (!stream || !stream.fd || !stream.pause) {
      throw new Error("Expected a Stream instance.");
    }

    return createDynamic(function() {
      if (this._fd) {
        throw new Error("A message can only contain one FD");
      }
      stream.pause();
      this._fd = stream.fd;
      return { fd: true };
    });
  }
}

/**
 *  ### messaging.release(stream, [error_string])
 *
 *  Releases specified `'stream'`
 */
exports.release = function() {
  var graph = Array.prototype.slice.call(arguments);
  var stream = graph.shift();
  
  return function(inargs, callback) {
    var args;
    
    if (stream && stream.readyState != "closed") {
      args = parseDynamics(inargs, graph);
      stream.destroy(new Error(args[0]));
      stream.on("error", function() {
        callback(inargs);
      });
      stream.on("close", function(hadError) {
        !hadError && callback(inargs);
      });
    } else {
      return inargs;
    }
  }
}

/**
 *  ### messaging.reject()
 *
 *  The chainable version of `'message.reject'´. The function can be used 
 *  in two ways, either by passing it to a ´chain` or by passing the message to
 *  reply to in context.
 *
 */
exports.reject = function() {
  if (typeof this.send == "function") {
    this.reject();
  } else {
    return function(ctx) {
      if (!ctx || typeof ctx.send != "function") {
        throw new Error("Context is not a channel or message.");
      }
      ctx.reject();
      return this;
    }
  }  
}

/**
 *  ### messaging.mmatch()
 */
exports.mmatch = function() {
  var args = Array.prototype.slice.call(arguments);
  var options = {
    prematch: function(args, out) {
      var msg;
      if (args[0].send) {
        msg = args.shift();
        out.channel = out.context;
        out.context = msg;
        return decode(msg, msg.encoding);
      }
      return args;
    }
  }
  return Matcher(args, options);
}


function implement(ctorA, ctorB) {
  for (var key in ctorB.prototype) {
    ctorA.prototype[key] = ctorB.prototype[key];
  }
}


//
function Channel() {
  var self = this;
  var nextfd; 

  this._closing = false;
  this._closed = false;
  this._sockets = [];
  
  // TODO: Temporary solution in order to disconnect a socket
  // that is connected, if this channel is the owner.
  this._closingAll = false;

  this._watchers = [];
}

exports.Channel = Channel;
inherits(Channel, EventEmitter);

exports.createChannel = function(type) {
  switch (type) {
    case "master": return new MasterChannel();
    case "worker": return new WorkerChannel();
    case "resp": return new ResponseChannel();
    case "req": return new RequestChannel();
    case "sub": return new SubscriberChannel();
    case "pub": return new PublisherChannel();
    default: throw new Error("Invalid channel type: " + type);
  }
};

Object.defineProperty(Channel.prototype, 'sockets', {
  get: function() {
    return this._sockets.slice(0);
  }
});

Channel.prototype.send = function(msg) {};

Channel.prototype.attach = function(socket) {
  if (socket instanceof this.SocketClass) {
    this._attachSocket(socket);
    socket.resume();
  } else {
    throw new Error("`socket` cannot be attached to this channel type.");
  }
};


Channel.prototype.connect = function(url, callback) {
  var socket;

  socket = new this.SocketClass();
  socket.connect(url);

  if (callback) {
    // TODO: Add callback handler to Error
  }
  
  this._attachSocket(socket);
}

Channel.prototype.listen = function(url, callback) {
  var self = this;
  var u = parseUrl(url);
  var host = url.hostname == "*" ? undefined : url.hostname;
  var port = parseInt(url.port);
  var bindargs = null;
  var protocol = u.protocol.toLowerCase();  
  var serverep = null;
  var type;
  var host;
  
  if (this.closing || this.closed) {
    throw new Error("Channel is closing/closed");
  }
    
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) == -1) {
    throw new Error("Protocol ´" + protocol + "´ is not supported");
  }
  
  switch (protocol) {
    
    case "proc:":
      host = createProcSockAlias(u.hostname);

    case "sock:":
      host = host || u.hostname;
      type = "unix";
      break;
    
    case "tcp:":
      type = "tcp";
      
      host = u.hostname;
      port = u.port;
      break;
      
    case "mem:":
      // TODO
      break;
  }

  this._doListen(null, type, host, port, function(err) {
    if (err) {
      if (callback) {
        callback(err);
      } else {
        self.emit("error", err);
      }
    }
  });
};

Channel.prototype._doListen = function(fd, type, host, port, callback) {
  var self = this;

  // Ensure we have a dummy fd for EMFILE conditions.
  getDummyFD();
    
  if (type === "tcp") {
    require('dns').lookup(host, function(err, ip, addressType) {
      var type;
      
      if (err) {
        callback(err);
      } else {
        type = addressType == 4 ? "tcp4" : "tcp6";
        self._doListen( socket(type)
                      , type
                      , ip
                      , port
                      , callback);
      }
    });
    return;
  }

  if (type == "unix" && !fd) {
    unlinksock(host, function(err) {
      if (err) {
        callback(err);
      } else {
        var fd = socket(type);
        self._doListen(fd, type, host, null, callback);
      }
    });
    return;
  }

  try {
    bind(fd, port || host, port && host || null);
  } catch (err) {
    console.log("-----------------------> error");
    console.log("host: %s, port: %s, fd: %s", host, port, fd);
    callback(err);
    return;
  }

  // Need to the listening in the nextTick so that people potentially have
  // time to register 'listening' listeners.
  process.nextTick(function() {

    // It could be that server.close() was called between the time the
    // original listen command was issued and this. Bail if that's the case.
    // See test/simple/test-net-eaddrinuse.js
    if (self.closing || self.closed) {
      return;
    } 

    try {
      listen(fd, 128);
    } catch (err) {
      callback(err);
      return;
    }

    self._attachWatcher(fd, type, host);
    
    callback(null);
  });
}


// close([all=true]) - Close all sockets even if parent dosent match.
Channel.prototype.close = function(all) {
  var self = this;
  var sockets = this._sockets;
  var sock;
  var index;
  
  if (this._closing || this._closed) {
    return;
  }
  
  // TODO: do a more correct solution for this.
  this._closeWaitCount = 0;

  this._closing = true;
  
  index = sockets.length;
  
  while (index--) {
    sock = sockets[index];

    if (sock._connecting) {
      // We need to wait for the socket to connect before the 
      // channel can be closed. 
      // 
      // TODO: Optimization, remove from connect-queue as well.

      self._closeWaitCount++;
    } else if (sock.channel == this || all === true) {
      // The socket was created by this 
      // channel (or `all` was set). Wait for 
      // it to die before raising `close`.

      self._closeWaitCount++;
      sock.destroy();
    } else {
      sockets.splice(index, 1);
    }
  }

  this._watchers.forEach(function(watcher) {

    watcher.stop();

    close(watcher.fd);

    watcher.fd = null;

    if (watcher.type === 'unix') {
      
      self._closeWaitCount++;
      
      require('fs').unlink(watcher.path, function(err) {
        self._closeWaitCount--;
        
        if (self._closeWaitCount == 0) {
          self._closing = false;
          self._closed = true;
          self.emit("close");
        }
      });
    } 
  });

  this.onclosing && this.onclosing();
  this.emit("closing");  
  
  if (this._closeWaitCount) {
    // We are not waiting for any sockets to die, so we 
    // can emit the `close` event immediately.
    
    this._closed = true;
    this.emit("close");
  } 
}

// Attach a client or server socket.
Channel.prototype._attachSocket = function(socket) {
  var self = this;
  var sockets = this._sockets;
  
  sockets.push(socket);

  if (socket._connecting) {
    // We need to wait for connection to connect before
    // we can raise the `connect` event.

    socket.once("connect", function() {
      var index;
      
      if (self._closing) {
        if (this.channel == self || self._closingAll) {
          // This instance is the owner of the socket. Close
          // socket and wait for it to die.

          this.end();
        } else {
          // Just remove it from sockets and raise
          // the event `close`, if this istance was the 
          // last socket.

          index = sockets.indexOf(this);
          notEqual(index, -1);
          
          sockets.splice(index, 1);
          self._closeWaitCount--;
          
          if (self._closeWaitCount == 0) {
            self._closing = false;
            self._closed = true;
            self.emit("close");
          }
          
        }
        
      } else {
        self.emit("connect", this);
      }
    });
  } else {
    // Socket connection is already estabilished, 
    // raise `connect` event.

    self.emit("connect", socket);
  }
  
  // Remove socket from `_sockets` when socket
  // is destroyed. Raise ´close´ if channel is closing,
  // and all sockets are disconnected.
  socket.once("close", function() {
    var index = sockets.indexOf(this);
    notEqual(index, -1);
    sockets.splice(index, 1);
    
    self.emit("disconnect", socket);
    
    if (self._closing) {
      
      self._closeWaitCount--;
      
      if (self._closeWaitCount == 0) {
        self._closing = false;
        self._closed = true;
        self.emit("close");
      }
    }
  });
};


Channel.prototype._attachWatcher = function(fd, type, path) {
  var self = this;
  var Socket = this.SocketClass;
  var watcher;
  
  watcher = new IOWatcher();
  watcher.host = this;
  watcher.type = type;
  watcher.fd = fd;
  watcher.path = path;
  watcher.callback = function() {
    var options;
    var sock;
    var info;

    // Just in case we don't have a dummy fd.
    getDummyFD();

    if (this._pauseTimer) {
      // Somehow the watcher got started again. Need to wait until
      // the timer finishes.
      this.stop();
    }

    while (this.fd) {

      try {
        info = accept(this.fd);
      } catch (e) {

        if (e.errno != EMFILE) { 
          throw e;
        }

        // Gracefully reject pending clients by freeing up a file
        // descriptor.
        rescueEMFILE(function() {
          this._rejectPending();
        });
        return;
      }

      if (!info) {
        return;
      } 

      sock = new Socket({ fd: info.fd, type: type });
      sock.remoteAddress = info.address;
      sock.remotePort = info.port;
      sock.channel = self;
      sock.type = type;

      sock.resume();

      self._attachSocket(sock);
    }
  };

  watcher.set(fd, true, false);
  watcher.start();
  
  this._watchers.push(watcher); 
};


// SenderImpl
function SenderImpl() {
  this._sendQueue = [];
  this._sendQueue.size = 0;
  this._sendQueueJobRunning = false;
  this._broadcastEndpointFilter = defaultBroadcastEndpointFilter;
  this._broadcastEndpointFilterOptions = {};
}

// Overrides Channel.send
SenderImpl.prototype.send = sendImpl;

SenderImpl.prototype._sendmsg = function(msg) {
  var self = this;
  var queue = this._sendQueue;

  // Discard messages if no sockets
  if (!this._sockets.length) {
    return;
  }
  
  queue.push(msg);
  queue.size += msg.length

  // Start send queue processing if not started.
  if (!this._sendQueueJobRunning) {
    this._startSendQueueJob();
  }    
}

SenderImpl.prototype._startSendQueueJob = function() {
  var self = this;
  var queue = this._sendQueue;
  var sockets = this._sockets;
  var filter = this._broadcastEndpointFilter;
  var opts = this._broadcastEndpointFilterOptions;
  var throttle = false;
  
  // Return if we send queue already is being processed 
  if (this._sendQueueJobRunning) {
    return;
  }
  
  // Discard all messages if we missing sockets
  if (!sockets.length) {
    this._sendQueue = [];
    this._sendQueue.size = 0;
    return;
  }
  
  this._sendQueueJobRunning = true;
  
  function run() {
    
    if (throttle) {
      throttle = true;
      self.emit("throttleStop");
    }

    var handle = processSendQueueJob(queue, sockets, filter, opts);
    
    if (handle) {
      self.emit("throttleStart");

      handle.ondrain = function() {
        throttle = true;
      }
      process.nextTick(run);        
    } else {
      self._sendQueueJobRunning = false;
    }
  }
  
  process.nextTick(run);
}

// RequesterImpl
function RequesterImpl() {
  this._requestQueue = [];
  this._readySockets = [];
  this._requestQueueJobRunning = false;
  
  this._sideQueue = [];
  this._sideQueueJobRunning = false;

  this.on("connect", this.RequesterImpl_connect);
  this.on("disconnect", this.RequesterImpl_disconnect);
}

RequesterImpl.prototype.RequesterImpl_connect = function(sock) {

  this._readySockets.push(sock);

  if (this._requestQueue.length && !this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
}

RequesterImpl.prototype.RequesterImpl_disconnect = function(sock) {
  var waitpool = sock._ackwaitpool;
  var keys = Object.keys(waitpool);
  var index = this._readySockets.indexOf(sock);
  var queue = this._requestQueue;
  var key;
  var msg;

  if (index !== -1) {
    this._readySockets.splice(index, 1);
  }

  index = keys.length;
  
  while (index--) {
    var key = keys[index];
    if ((msg = waitpool[key])) {
      queue.push(msg);
    }
  }

  if (queue.length && !this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }    
}

RequesterImpl.prototype.send = function() {
  var self = this;
  var args = slice.call(arguments);
  var handler;
  var graph;

  function callback(err, msg) {
    
    if (!self._requestQueueJobRunning) {
    	self._startRequestQueueJob();
    }
    
    if (err) {
      if (handler) {
        handler(null, 'ERROR', err.message || err.toString());
      } else {
        self.emit("error", err);
      }
    } else if (msg.rejected) {
      if (handler) {
        handler(null, 'REJECT');
      } else {
        self.emit("error", "Message was rejected");
      } 
    } else if (handler) {
      graph = msg.graph;

      if (graph instanceof Buffer) {

        handler.call(self, msg, graph);
      } else {

        switch (graph.length) {

          case 1:
            handler.call(self, msg, graph[0]);
            break;

          case 2:
            handler.call(self, msg, graph[0], graph[1]);
            break;

          case 3:
            handler.call(self, msg, graph[0], graph[1], graph[2]);
            break;

          case 4:
            handler.call(self, msg, graph[0], graph[1], graph[2], graph[3]);
            break;
            
          default:
            handler.apply(self, [msg].concat(graph));            
            break;
        }
      }
    } else {
      self.emit("message", msg, msg.graph);
    }
  }
  
  if (typeof args[args.length - 1] == "function") {
    handler = args.pop();
  }

  return sendImpl.call(this, args, callback);
};

RequesterImpl.prototype._sendmsg = function(msg, queueOnFail) {

  this._requestQueue.push(msg);
  
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
};

RequesterImpl.prototype._startRequestQueueJob = function() {
  var self = this;
  var queue = this._requestQueue;
  var sockets = this._readySockets;

  // Return if we send queue already is being processed or 
  // no sendqueue or no ready sockets.
  if (this._requestQueueJobRunning || 
      !queue.length || 
      !sockets.length) {
    return;
  }

  this._requestQueueJobRunning = true;

  function run() {
    var fullsockets = null;
    var index = 0;
    var socket = null;
	  
    fullsockets = processRequestQueueJob(queue, sockets);

    if (fullsockets) {
      index = fullsockets.length;
      while (index--) {
        socket = fullsockets[index];

        function ondrain() {
          this.removeListener("drain", ondrain);
          sockets.push(this);
          if (queue.length && !self._requestQueueJobRunning) {
            self._startRequestQueueJob();
          }
        }
        
        socket.on("drain", ondrain);
      }
    }

    self._requestQueueJobRunning = false;
  }
  
  process.nextTick(run);
}

RequesterImpl.prototype._startSideQueueJob = function() {
  var self = this;
  
  if (self._sideQueueJobRunning) {
    return;
  }

  self._sideQueueJobRunning = true;

  setTimeout(function() {
    var queue = self._requestQueue;
    var sidequeue = self._sideQueue;
    
    for (var i = 0, l = sidequeue.length; i < l; i++) {
      queue.push(sidequeue[i]);
    }
    
    self._sideQueue = [];
    self._sideQueueJobRunning = false;
    
    if (!self._requestQueueJobRunning) {
    	self._startRequestQueueJob();
    }
    
  }, SQ_FLUSH_INTERVAL);
}

RequesterImpl.prototype._processMessage = function(socket, raw) {
  var sockets = this._readySockets;
  var queue = this._requestQueue;
  var sidequeue = this._sideQueue;
  var waitpool = socket._ackWaitPool;
  var ack = raw[ACK_OFFSET];
  var req = waitpool[ack];
  var ackfree = false;
  var msg;

  // Ignore message if we currently doesn't have a
  // corresponding wait handle or messages that is flaged as
  // OPTION. 
  if (!req || (raw[FLAG_OFFSET] & OPTION) == OPTION) {
    return;
  }
  
  msg = raw.slice(PAYLOAD_OFFSET, raw.length);
  msg._fd = raw._fd;

  // Free ack handle in socket wait pool
  waitpool[ack] = undefined;
  ackfree = (socket.outgoingCount-- == socket.outgoingMax);
	
  // Push socket back to socket if not write queue is full
  // and currently not in list.
  if (!socket._waitingForFlush && ackfree) {
    sockets.push(socket);
  }
  
  // Message was rejected by remote socket. The socket was probably
  // busy. Queue message again for a second try.
  // 
  // else
  // 
  // We got a succesfull response. Notify user, if requested.
  if ((raw[FLAG_OFFSET] & REJECT) == REJECT) {
    sidequeue.push(req);
    if (!this._sideQueueJobRunning) {
      this._startSideQueueJob();
    }
  } else {
    if (req._callback) {
      req._callback.call(null, msg);                                   
    } else {
      this._events && this._events["message"] && this.emit("message", msg);
    }
  }

	// Start send queue process if pending pakets
  if (queue.length && !this._requestQueueJobRunning) {
  	this._startRequestQueueJob();
  }
 
}

function ResponderImpl() {
  this.on("connect", this.ResponderImpl_connect);
  this.on("disconnect", this.ResponderImpl_disconnect);
}

ResponderImpl.prototype.ResponderImpl_connect = function(socket) {
  var self = this;
  socket.on("message", function(msg) {
    self.emit("message", msg);
  });
}

ResponderImpl.prototype.ResponderImpl_disconnect = function(socket) {
  
}


/**
 *  SubscriberImpl
 */
function SubscriberImpl() {
  this._subscriptions = {};
  this._exclusions = [];
  this.on("connect", this._SubscriberImpl_connect);  
}

SubscriberImpl.prototype._SubscriberImpl_connect = function(socket) {
  var subs = this._subscriptions;
  var exclusions = this._exclusions;
  var keys = Object.keys(subs);
  var index = keys.length;
  var payload = null;
  var msg = null;
  
  while (index--) {
    payload = new Buffer(" " + keys[index], "binary");
    payload[0]= SUBSCRIBE
    msg = createMessage(payload, OPTION, 0);
    socket.write(msg);
  }
  
  index = exclusions.length;

  while (index--) {
    payload = new Buffer(" " + exclusions[index], "binary");
    payload[0] = EXCLUDE;
    msg = createMessage(payload, OPTION, 0);
    socket.write(msg);
  }
}

SubscriberImpl.prototype.exclude = function(source) {
  var sockets = null;
  var socket = null;
  var payload = null;
  var msg = null;
  var index = null;
  
  if (this._exclusions.indexOf(source) == -1) {
    this._exclusions.push(source);
    sockets = this._sockets;
    index = sockets.length;

    // Don't bother of sending subscription update if we don't have
    // an socket attached.
    if (!index) {
      return;
    }

    payload = new Buffer(" " + source, "binary");
    payload[0] = EXCLUDE;
    msg = createMessage(payload, OPTION, 0);

    while (index--) {
      socket = sockets[index];
      if (socket.writable) {
        sockets[index].write(msg);
      }
    }
  }
}

SubscriberImpl.prototype.include = function(source) {
  var sockets = null;
  var socket = null;
  var payload = null;
  var msg = null;
  var index = null;
  
  if ((index = this._exclusions.indexOf(source)) != -1) {
    this._exclusions.splice(index, 1);

    sockets = this._sockets;
    index = sockets.length;

    // Don't bother of sending subscription update if we don't have
    // an socket attached.
    if (!index) {
      return;
    }

    payload = new Buffer(" " + source, "binary");
    payload[0] = INCLUDE;
    msg = createMessage(payload, OPTION, 0);

    while (index--) {
      socket = sockets[index];
      if (socket.writable) {
        sockets[index].write(msg);
      }
    }
  }
}

/**
 *  ### Channel.subscribe(pattern)
 * 
 *  Subscribes to a specific message pattern. The pattern MUST be a string
 */
SubscriberImpl.prototype.subscribe = function(pattern) {
  var sockets = null;
  var socket = null;
  var payload = null;
  var msg = null;
  var index = null;

  if (this.encoding !== "raw" && pattern.length) {
    throw new Error("Subscriptions patterns is only allowed on raw encoded \
                     channel");
  }
  
  // Convert to string for easier internal use.
  if (Buffer.isBuffer(pattern)) {
    pattern = pattern.toString("binary");
  }
  
  // Check if this is a new subscription. If so, send a SUBSCRIBE message
  // to sockets. Else, just increase the counter. 
  if (!this._subscriptions[pattern]) {
    this._subscriptions[pattern] = 1;
    
    this.emit("subscribe", pattern);
    
    sockets = this._sockets;
    index = sockets.length;

    // Don't bother of sending subscription update if we don't have
    // an socket attached.
    if (!index) {
      return;
    }

    payload = new Buffer(" " + pattern, "binary");
    payload[0] = SUBSCRIBE;
    msg = createMessage(payload, OPTION, 0);

    while (index--) {
      socket = sockets[index];
      if (socket.writable) {
        sockets[index].write(msg);
      }
    }
  } else {
    this._subscriptions[pattern] += 1;
  }
}

/**
 *  ### Channel.unsubscribe(pattern)
 *
 *  Unsubscribes to a specific message pattern
 */
SubscriberImpl.prototype.unsubscribe = function(pattern) {
  var payload = null;
  var msg = null;
  var sockets = null;
  var socket = null;

  if (this.encoding !== "raw" && pattern.length) {
    throw new Error("Subscriptions patterns is only allowed on raw encoded \
                     channel");
  }
  
  // Convert to string for easier internal use.
  if (Buffer.isBuffer(pattern)) {
    pattern = pattern.toString("binary");
  }
  
  // Check if all subscription is handlers is unregistered. If so, send 
  // an UNSUBSCRIBE message to sockets. 
  if (this._subscriptions[pattern]) {
    this._subscriptions[pattern] -= 1;
    
    if (!this._subscriptions[pattern]) {
      delete this._subscriptions[pattern];
      
      this.emit("unsubscribe", pattern);

      // Don't bother of sending subscription update if we don't have
      // an socket attached.
      if (!this._sockets.length) {
        return;
      }
      
      sockets = this._sockets;
      index = sockets.length;

      payload = new Buffer(" " + pattern, "binary");
      payload[0] = UNSUBSCRIBE;
      msg = createMessage(payload, OPTION, 0);

      while (index--) {
        socket = sockets[index];
        if (socket.writable) {
          sockets[index].write(msg);
        }
      }
    }
  }  
}

/**
 *  ### Channel.pause()
 *
 *  Pause incomming message from all remote sockets.
 *
 *  This features is only supported by the `'sub'` channel.
 */
SubscriberImpl.prototype.pause = function() {
  var sockets = this._sockets;
  var index = sockets.length;

  while (index--) {
    sockets[index].pause();
  }  
}

/**
 *  ### Channel.resume()
 *
 *  Resumes incomming message from all remote sockets.
 *
 *  This features is only supported by the `'sub'` channel.
 */
SubscriberImpl.prototype.resume = function() {
  var sockets = this._sockets;
  var index = sockets.length;

  while (index--) {
    sockets[index].resume();
  }  
}


function PublisherImpl() {  
  this._subscriptions = {};
  this._pipedChannels = [];
  this._hasPatternLengthVariants = -1;
  this._broadcastEndpointFilter = patternBasedEndpointFilter;
  this._broadcastEndpointFilterOptions = { longestKey: 0 };
  this.on("disconnect", this._PublisherImpl_disconnect);
}

PublisherImpl.prototype._PublisherImpl_disconnect = function(socket) {
  var opts = this._broadcastEndpointFilterOptions;
  var subs = socket._subscriptions;
  var index = subs ? subs.length : 0;
  var sub = null;
  var longest = 0;

  while (index--) {
    sub = subs[index];
    longest = sub.length > longest ? sub.length: longest;
    this._removeSubscription(socket, sub);
  }
  
  if (longest == opts.length) {
    this._recalcLongestKey();
  }
}

PublisherImpl.prototype._PublisherImpl_throttleStart = function(size) {
  var channels = this._pipedChannels;
  var index = channels.length;
  while (index--) {
    channels[index].pause();
  }
}

PublisherImpl.prototype._PublisherImpl_throttleStop = function(size) {
  var channels = this._pipedChannels;
  var index = channels.length;
  while (index--) {
    channels[index].resume();
  }  
}

/**
 *  Pipes a subscriber message to this publisher. All messages is forwards 
 *  that is received on this channel.
 *
 *  @param {Channel} channel The subscriber channel instance to receive from.
 */
PublisherImpl.prototype.pipe = function(channel) {
  var self = this;
  var channels = this._pipedChannels;
  var keys = Object.keys(this._subscriptions);
  var index = keys.length;

  if (channel instanceof SubscriberChannel) {
    throw new Error("Expected a subscriber channel");
  }
  
  if (channels.indexOf(channel) != -1) {
    throw new Error("Channel already in pipe-line");
  }
  
  if (channels.length == 0) {
    this.on("throttleStart", this._PublisherImpl_throttleStart);
    this.on("throttleStop", this._PublisherImpl_throttleStop);
  }
  
  // Pipe all messages in channel to publishers
  // send queue.
  channel.on("rawmessage", this._sendMsg.bind(this));
  channel.on("close", function( ) {
    var index = channels.indexOf(this);
    
    if (index != -1) {
      channels.splice(index, 1);
    }
    
    if (channels.length == 0) {
      self.removeListener("throttleStart", this._PublisherImpl_throttleStart);
      self.removeListener("throttleStop", this._PublisherImpl_throttleStop);
    }
  });
  
  while (index--) {
    channel.subscribe(keys[index]);
  }
  
  channels.push(channel);
}


PublisherImpl.prototype._processMessage = function(socket, raw) {
  var pattern = getString(this.encoding, OPTIONVAL_OFFSET, raw);
  var index;
  var exclusions;
  var subs;
  var index;

  // Ignore all message's that isn't flag with OPTION
  if ((raw[FLAG_OFFSET] & OPTION) != OPTION) {
    return;
  }

  switch (raw[PAYLOAD_OFFSET]) {
    
    case INCLUDE:
      exclusions = socket._exclusions;
    
      if (exclusions && (index = exclusions.indexOf(pattern)) != -1) {
        exclusions.splice(index, 1);
      }
      break;
      
    case EXCLUDE:
      exclusions = socket._exclusions;
      
      if (!exclusions) {
        exclusions = socket._exclusions = [pattern];
      } else if (exclusions.indexOf(pattern) == -1) {
        exclusions.push(pattern);
      }
      break;
    
    case SUBSCRIBE:
      subs = socket._subscriptions;

      if (!subs) {
        subs = socket._subscriptions = [pattern];
        
        if (pattern.length == 0) {
          socket._nullSubscriptions = true;
        }
        
        this._addSubscription(socket, pattern);
      } else if (subs.indexOf(pattern) == -1) {
        
        if (pattern.length == 0) {
          socket._nullSubscriptions = true;
        }
        
        subs.push(pattern);
        this._addSubscription(socket, pattern);
      }
      
      break;
      
    case UNSUBSCRIBE:
      subs = socket._subscriptions;

      if (!subs || (index = subs.indexOf(pattern)) == -1) {
        return;
      }
      
      if (pattern.length == 0) {
        socket._nullSubscriptions = false;
      }
      
      subs.splice(index, 1);
    
      this._removeSubscription(socket, pattern);      
      break;

    default:
      console.log("PublisherImpl: invalid option type " + raw[PAYLOAD_OFFSET]);
      break;
  }
}

PublisherImpl.prototype._recalcLongestKey = function() {
  var opts = this._broadcastEndpointFilterOptions;
  var subs = this._subscriptions;
  var index = subs.length;
  var longest = -1;
  var hasVariants = false;

  while (index--) {
    if (subs[index].length && subs[index] > longest) {
      if (longest == -1) {
        longest = subs[index].length;
      } else {
        longest = subs[index].length;
        hasVariants = true;
      }
    } 
  }

  this._hasPatternLengthVariants = hasVariants;
  opts.longest = longest;
}

PublisherImpl.prototype._addSubscription = function(socket, pattern) {
  var subs = this._subscriptions[pattern];
  var opts = this._broadcastEndpointFilterOptions;
  var patternl = pattern.length;
  var longest = opts.longestKey;
  var hasVariants = this._hasPatternLengthVariants;
  var pipedChannels = this._pipedChannels;
  var index;
  
  if (!subs) {
    subs = this._subscriptions[pattern] = [socket];
    
    // Check if we have variable pattern lenghts. This is 
    // an optimization that let us skip recalcLongestKey when 
    // remvoing subscriptions.
    if (hasVariants == -1) {
      this._hasPatternLengthVariants = false;
    } else if (!hasVariants && patternl && longest && patternl != longest) {
      this._hasPatternLengthVariants = true;
    }
    
    // Check if this subscription is the longest one.
    if (patternl > longest) {
      opts.longestKey = patternl;
    }
    
    // Update subscrptions model for piped channels
    if ((index = pipedChannels.length)) {
      while (index--) {
        pipedChannels[index].subscribe(pattern);
      }
    }
    
    this.emit("subscribe", pattern);
  } else {
    
    // Do not add same socket to list twice.
    if (subs.indexOf(socket) == -1) {
      subs.push(socket);
    }
  }
}

PublisherImpl.prototype._removeSubscription = function(socket, pattern) {
  var subs = this._subscriptions[pattern];
  var index = subs ? subs.indexOf(socket) : -1;
  var opts = this._broadcastEndpointFilterOptions;
  var pipedChannels = this._pipedChannels;

  if (index !== -1) {
    subs.splice(index, 1);

    // Delete subscriptions for pattern IF this was the 
    // last subscription. 
    if (!subs.length) {
      delete this._subscriptions[pattern];
      
      // Reset has pattern length variants if there is no more
      // subscriptions.
      if (Object.keys(this._subscriptions).length) {
        opts.longestKey = 0;
        this._hasPatternLengthVariants = -1;
      } else {
        
        // Recalculate longest key if this pattern is 
        // the longest and we have pattern length variants.
        if (this._hasPatternLengthVariants && 
            opts.longest == pattern.length) {
          this._recalcLongestKey();
        }
      }
      
      this.emit("unsubscribe", pattern);
    }

    // Update subscrptions model for piped channels
    if ((index = pipedChannels.length)) {
      while (index--) {
        pipedChannels[index].unsubscribe(pattern);
      }
    }
    
  }
}

// Initializes a new RequestChannel instance.
function RequestChannel() {
  Channel.call(this, "req");
  RequesterImpl.call(this);
}

exports.RequestChannel = RequestChannel;
inherits(RequestChannel, Channel);
implement(RequestChannel, RequesterImpl);

RequestChannel.prototype.SocketClass = RequesterSocket;

// Initializes a new ResponderChannel instance.
function ResponseChannel() {
  Channel.call(this, "resp");
  ResponderImpl.call(this);
}

exports.ResponseChannel = ResponseChannel;
inherits(ResponseChannel, Channel);
implement(ResponseChannel, ResponderImpl);

ResponseChannel.prototype.SocketClass = ResponderSocket;


// Initializes a new MasterChannel instance.
function MasterChannel() {
  Channel.call(this, "master");
  RequesterImpl.call(this);
}

exports.MasterChannel = MasterChannel;
inherits(MasterChannel, Channel);
implement(MasterChannel, RequesterImpl);

MasterChannel.prototype.SocketClass = RequesterSocket;


// Initializes a new WorkerChannel instance.
function WorkerChannel() {
  Channel.call(this, "worker");
  ResponderImpl.call(this);
}

exports.WorkerChannel = WorkerChannel;
inherits(WorkerChannel, Channel);
implement(WorkerChannel, ResponderImpl);

WorkerChannel.prototype.SocketClass = ResponderSocket;


// Initializes a new PublisherChannel instance.
function PublisherChannel() {
  Channel.call(this, "pub");
  SenderImpl.call(this);
  PublisherImpl.call(this);
}

exports.PublisherChannel = PublisherChannel;
inherits(PublisherChannel, Channel);
implement(PublisherChannel, SenderImpl);
implement(PublisherChannel, PublisherImpl);

PublisherChannel.prototype.SocketClass = PublisherSocket;


// Creates a new Subscriber Channel instance
function SubscriberChannel() {
  Channel.call(this, "sub");
  SubscriberImpl.call(this);
}

exports.SubscriberChannel = SubscriberChannel;
inherits(SubscriberChannel, Channel);
implement(SubscriberChannel, SubscriberImpl);

SubscriberChannel.prototype.SocketClass = SubscriberSocket;


// Internal class.
function DrainWaitHandle() {
  EventEmitter.call(this);
  this.ondrain = null;
  this._count = 0;
  this._emitted = false;
}

DrainWaitHandle.prototype.push = function(socket) {
  var self = this;

  function free() {
    socket.removeListener("close", free);
    socket.ondrain = null;
    if (!(--self._count)) {
      self.ondrain && self.ondrain();
    }
  }

  socket.ondrain = free;
  socket.on("close", free);
  
  this._count++;
}


// Process specified request queue.
function processRequestQueueJob(queue, sockets) {
  var socket = null;
  var msg = null;
	var ack = null;
	var waitpool = null;
	var flushed = false;
	var fullsockets = null;

  while (queue.length && sockets.length) {
    msg = queue.shift();

    while ((socket = sockets.shift())) {

      if (!socket.writable || !socket.fd) {
        // Check if socket is writable. Try next 
        // socket if not. 

        continue;
      }

      if (msg._fd && socket.type != "unix") {
        // Trying to send a FD message, but current socket 
        // does not support it? Push socket back to 
        // readyEndpoints. 
        //
        // Note: This can genereate some overhead, if same 
        // socket is called twice. 

        sockets.push(socket);
        continue;
      }
      
      if (socket.hasAvailableHandlers() == false) {
        // Socket has no available handlers. Continue
        // the search for a free socket.
        
        continue;
      }

      flushed = socket._sendmsg(msg, false);
      
      if (flushed) {

        if (socket.hasAvailableHandlers() == true) {
          // Socket got more handlers. Add it back to 
          // available sockets.
          
          sockets.push(socket);
        } else {
          // Wait for socket to do a successfully flush.
          
          !fullsockets && (fullsockets = []);
          fullsockets.push(socket);
        }
        
      } else {
        
        if (!msg._off) {
          // Message was not queued to sockets sendqueue. Try
          // next socket.

          continue;
        } else {
          // Wait for socket to do a successfully flush.
          
          !fullsockets && (fullsockets = []);
          fullsockets.push(socket);
        }
        
      }

      // Message is handled, break loop
      break;
    }
    
    // TODO: Add message back to the queue?
  }

	return fullsockets;
}

function processSendQueueJob(queue, sockets, filter, filterOpts) {
  var size = queue.length;
  var socket = null;
  var sendlist = null;
  var index = null;
  var msg = null;
  var dest = null;
  var drainWaitHandle = null;

  while (!drainWaitHandle && (msg = queue.shift())) {

    sendlist = filter(msg._targets || sockets, msg, filterOpts);
    index = sendlist.length;
    
    while (index--) {
      socket = sendlist[index];
      
      try {
        if (!socket.write(msg)) {

          if (!drainWaitHandle) {
            drainWaitHandle = new DrainWaitHandle();
          }

          drainWaitHandle.push(socket);
        }
      } catch (error) {}
    }
    
    queue.size -= msg.length;
  }
  
  // Return no of sent messages.
  return drainWaitHandle;
}

// Returns a list with all sockets that 
// should receive specified message.
function defaultBroadcastEndpointFilter(sockets, msg, opts) {
  var index = sockets.length;
  var socket = null;
  var result = [];

  while (index--) {
    socket = sockets[index];
    if (socket.writable && socket.fd) {
      result.push(socket);
    }
  }
  
  return result;
}

// Returns a list of sockets that has a 
// matching pattern for the specified msg.
function patternBasedEndpointFilter(sockets, msg, opts) {
  var longest = Math.min(opts.longestKey, msg.length - PAYLOAD_OFFSET);
  var pattern = msg.toString("binary", PAYLOAD_OFFSET, PAYLOAD_OFFSET + longest);
  var origin = msg.origin;
  var index = sockets.length;
  var patternIndex = null;
  var socket = null;
  var subs = null;
  var result = [];

  while (index--) {
    socket = sockets[index];
    
    // Check if socket is writable.
    if (socket.writable && socket.fd) {
      if (socket._exclusions && socket._exclusions.length && 
          origin && origin._originType &&
          socket._exclusions.indexOf(origin._originType) != -1) {
        continue;
      }
      
      // Add socket to result list if he subscribes to 
      // ALL messages, else try to filter against 
      // socket subscriptions.
      if (socket._nullSubscriptions) {
        result.push(socket);
      } else {
        subs = socket._subscriptions;
        patternIndex = (subs && subs.length) || 0;

        while (patternIndex--) {
          if (pattern == subs[patternIndex].substr(0, pattern.length)) {
            result.push(socket);
            break;
          }
        }
      }
    }
  }

  return result;
}


var dummyFD = null;
var lastEMFILEWarning = 0;
// Ensures to have at least on free file-descriptor free.
// callback should only use 1 file descriptor and close it before end of call
function rescueEMFILE(callback) {
  // Output a warning, but only at most every 5 seconds.
  var now = new Date();
  if (now - lastEMFILEWarning > 5000) {
    console.error('(node) Hit max file limit. Increase "ulimit - n"');
    lastEMFILEWarning = now;
  }

  if (dummyFD) {
    close(dummyFD);
    dummyFD = null;
    callback();
    getDummyFD();
  }
}

function getDummyFD() {
  if (!dummyFD) {
    try {
      dummyFD = socket('tcp');
    } catch (e) {
      dummyFD = null;
    }
  }
}

// Unlink socket file
function unlinksock(path, callback) {
  require('fs').stat(path, function(err, r) {
    if (err) {
      if (err.errno == ENOENT) {
        callback(null);
      } else {
        callback(r);
      }
    } else {
      if (!r.isSocket()) {
        callback(new Error('Non-socket exists at  ' + path));
      } else {
        require('fs').unlink(path, callback);
      }
    }
  });
}
