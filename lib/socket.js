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
const Stream                = require("stream").Stream
    , FreeList              = require('freelist').FreeList
    , Buffer                = require("buffer").Buffer
    , EventEmitter          = require("events").EventEmitter
    , inherits              = require("util").inherits
    , parseUrl              = require("url").parse
    , enroll                = require("timers").enroll
    , unenroll              = require("timers").unenroll
    , timers                = require('timers').active
    , notEqual              = require("assert").notEqual
    , ok                    = require("assert").ok
    
const slice                 = Array.prototype.slice;
    
const createProcSockAlias   = require("./utils").createProcSockAlias
    , sendImpl              = require("./message").sendImpl
    , parseMessage          = require("./message").parseMessage
    , implementAckMethods   = require("./message").implementAckMethods
    
const sendMsg               = process.binding("net").sendMsg
    , recvMsg               = process.binding("net").recvMsg
    , socket                = process.binding("net").socket
    , bind                  = process.binding("net").bind
    , connect               = process.binding("net").connect
    , listen                = process.binding("net").listen
    , accept                = process.binding("net").accept
    , close                 = process.binding("net").close
    , shutdown              = process.binding("net").shutdown;
    , read                  = process.binding("net").read;
    , write                 = process.binding("net").write
    , toRead                = process.binding("net").toRead
    , setNoDelay            = process.binding("net").setNoDelay
    , setKeepAlive          = process.binding("net").setKeepAlive
    , socketError           = process.binding("net").socketError
    , socketError           = process.binding("net").socketError
    , getsockname           = process.binding("net").getsockname;
    , errnoException        = process.binding("net").errnoException;

const IOWatcher             = process.binding('io_watcher').IOWatcher;

const ENOENT                = process.binding("constants").ENOENT;  
const EMFILE                = process.binding("constants").EMFILE;
const EINPROGRESS           = process.binding("constants").EINPROGRESS || 
                              process.binding("constants").WSAEINPROGRESS;

const LENGTH_OFFSET         = require("./message").LENGTH_OFFSET
    , LENGTH_SIZE           = require("./message").LENGTH_SIZE
    , FLAG_OFFSET           = require("./message").FLAG_OFFSET
    , FLAG_SIZE             = require("./message").FLAG_SIZE
    , ACK_OFFSET            = require("./message").ACK_OFFSET
    , ACK_SIZE              = require("./message").ACK_SIZE
    , PAYLOAD_OFFSET        = require("./message").PAYLOAD_OFFSET
    , HEADER_SIZE           = require("./message").HEADER_SIZE
    

var ioWatchers = new FreeList('iowatcher', 100, function() {
  return new IOWatcher();
});

function setImplmentationMethods(socket) {

  if (socket.type == "unix") {
    
    socket._sizebuffer = new Buffer(LENGTH_SIZE);
    socket._currbuffer = socket._sizebuffer;
    
    socket._writeImpl = function(buf, off, len, fd, flags) {
      // We do not need Nodejs's noData impl. here, because
      // our messages always contains a payload.
      
      return sendMsg(socket.fd, buf, off, len, fd, flags);
    };
      
    socket._readImpl = function(buf, off, len, calledByIOWatcher) {
      var bytesread = recvMsg(socket.fd, buf, off, len);

      if (recvMsg.fd !== null) {
        socket._pendingfd = recvMsg.fd;
      }

      return bytesread;
    };
  } else if (socket.type == "mem") {
    // MemStream doesn't need a message parser. We always expects 
    // complete messages to be received.
    
    if (socket.type == "mem") {
      socket.on("data", function(buffer) {
        var part;
        var pos;

        if ((buffer[FLAG_OFFSET] & MULTIPART) == MULTIPART)  {
          pos = 0;
          while (pos < buffer.length) {
            part = buffer.slice(pos, pos + (buffer[pos] * 256) + buffer[pos + 1]);
            parseAndProcessMessage(part);
            pos += part.length;
          }
        } else {
          parseAndProcessMessage(buffer);
        }
    });
    return;
  } else {
    
    socket._sizebuffer = new Buffer(LENGTH_SIZE);
    socket._currbuffer = socket._sizebuffer;
    
    socket._writeImpl = function(buf, off, len, fd, flags) {
      // XXX: TLS support requires that 0-byte writes get processed
      //      by the kernel for some reason. Otherwise, we'd just
      //      fast-path return here.

      // Drop 'fd' and 'flags' as these are not supported by the write(2)
      // system call
      return write(socket.fd, buf, off, len);
    };

    socket._readImpl = function(buf, off, len) {
      return read(socket.fd, buf, off, len);
    };
  }
  
  socket._shutdownImpl = function() {
    shutdown(socket.fd, 'write');
  };
 
}


function onReadable(readable, writable) {
  ok(this.socket);
  var socket = this.socket;
  socket._onReadable();
}


function onWritable(readable, writable) {
  ok(this.socket);
  var socket = this.socket;
  if (socket._connecting) {
    ok(socket.writable);
    socket._onConnect();
  } else {
    socket._onWritable();
  }
}

function initSocket(self) {
  self._readWatcher = ioWatchers.alloc();
  self._readWatcher.socket = self;
  self._readWatcher.callback = onReadable;
  self.readable = false;

  self._sendqueue = [];

  self._writeWatcher = ioWatchers.alloc();
  self._writeWatcher.socket = self;
  self._writeWatcher.callback = onWritable;
  self.writable = false;
}


// More or less a rip-off of node/net/Socket. There is too many
// implementations methods that we need to override, so it is 
// easier to host our own.
function ParallSocket(options) {
  Stream.call(this);
    
  this.fd = null;
  this.type = null;
  
  this.fd = opts.fd !== undefined ? parseInt(opts.fd, 10) : null;
  this.type = opts.type || null;
  
  this._originType = opts.originType || null;
  
  this._reconnectAttempt = 0;
  this._reconnectSlotNo = null;
  
  if (opts.disableReconnect) {
    this._reconnectMaxAttempts = 0;
  } else {
    this._reconnectMaxAttempts = opts.maxReconnectAttemps || -1;
  }

  this._closing = false;
  this._connected = false;
  
  this._pendingfd = null;
  this._multipartcache = null;
  
  if (parseInt(this.fd, 10) >= 0) {
    this.open(this.fd, this.type);
  } else {
    setImplmentationMethods(this);
  }
}

exports.ParallSocket = Socket;
inherits(ParallSocket, Socket);

Object.defineProperty(ParallSocket.prototype, 'readyState', {
  get: function() {
    if (this._connecting) {
      return 'opening';
    } else if (this.readable && this.writable) {
      ok(typeof this.fd == 'number');
      return 'open';
    } else if (this.readable && !this.writable) {
      ok(typeof this.fd == 'number');
      return 'readOnly';
    } else if (!this.readable && this.writable) {
      ok(typeof this.fd == 'number');
      return 'writeOnly';
    } else {
      ok(typeof this.fd != 'number');
      return 'closed';
    }
  }
});

ParallSocket.prototype._onTimeout = function() {
  this.emit('timeout');
};

ParallSocket.prototype._onReadable = function() {
  var buffer = this._currbuffer;
  var pos = buffer._pos;
  var tmpbuffer;
  var bytesRead;
  var msg;

  try {
    bytesRead = this._readImpl( buffer
                              , pos
                              , buffer.length - pos);
  } catch (e) {
    socket.destroy(e);
    return;
  }

  if (bytesRead === 0) {
    this.readable = false;
    this._readWatcher.stop();

    if (!this.writable) this.destroy();
    // Note: 'close' not emitted until nextTick.

    if (this._events && this._events['end']) this.emit('end');
    if (this.onend) this.onend();
    return;
  }
  
  active(this);
  
  buffer._pos += bytesRead;

  // We got the size of the message. We can now allocate a new message
  // buffer and start receive to that instead. Else wait for the actual 
  // message size. wait for morebytes...
  // 
  // Else, wait for all bytes in message to be read. Then notify channel
  // that a new message is waiting.
  if (buffer._pos == LENGTH_SIZE) {
    tmpbuffer = new Buffer((buffer[0] * 256) + buffer[1]);
    tmpbuffer[0] = buffer[0];
    tmpbuffer[1] = buffer[1];
    
    // Reset pos for next read.
    buffer._pos = 0;
    
    tmpbuffer._pos = buffer._pos;
    this._currbuffer = tmpbuffer;
  } else if (buffer._pos === buffer.length) {

    msg = parseMessage(buffer, this);
    msg.origin = this;

    this._processMessage(msg);

    // Read next message
    this._currbuffer = this._sizebuffer;
  }
  
};

ParallSocket.prototype._onWritable = function() {
  // Socket becomes writable on connect() but don't flush if there's
  // nothing actually to write
  if (this.flush()) {
    if (this._events && this._events['drain']) this.emit('drain');
    if (this.ondrain) this.ondrain(); // Optimization
    if (this.__destroyOnDrain) this.destroy();
  }
};

ParallSocket.prototype.open = function(fd, type) {
  initSocket(this);

  this.fd = fd;
  this.type = type || null;
  this.readable = true;

  setImplmentationMethods(this);

  this._writeWatcher.set(this.fd, false, true);
  this.writable = true;
};


// Override Socket.connect
ParallSocket.prototype.connect = function(url) {
  var lastarg = arguments[arguments.length - 1];
  var u = parseUrl(url);
  var port = null;
  var host = null;
  var protocol = u.protocol;
  
  initSocket(this);
  
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) == -1) {
    throw new Error("Protocol ´" + protocol + "´ is not supported");
  }
  
  if (this.fd) {
    throw new Error("Socket already opened");
  }
  
  if (!this._readWatcher) {
    throw new Error('No readWatcher');
  } 
  
  if (typeof lastarg == 'function') {
    self.addListener('connect', lastarg);
  }

  active(this);
  
  switch (protocol) {
    
    case "proc:":
      host = createProcSockAlias(url.hostname);

    case "sock:":
      host = host || url.hostname;
      
      this.fd = socket("unix");
      this.type = "unix";
      
      setImplmentationMethods(this);
      break;
    
    case "tcp:":
      selt.type = "tcp";
      
      host = url.hostname;
      port = url.port || DEFAULT_TCP_PORT;
      
      break;
      
    case "mem:"
      // TODO
      break;
  }

  this._connecting = true; // set false in doConnect
  
  ConnectWorker(this, port, host);
}

// Placeholder
ParallSocket.prototype._processMessage = function() { }

ParallSocket.prototype.address = function() {
  return getsockname(this.fd);
};


ParallSocket.prototype.setNoDelay = function(v) {
  if ((this.type == 'tcp4') || (this.type == 'tcp6')) {
    setNoDelay(this.fd, v);
  }
};

ParallSocket.prototype.setKeepAlive = function(enable, time) {
  if ((this.type == 'tcp4') || (this.type == 'tcp6')) {
    var secondDelay = Math.ceil(time / 1000);
    setKeepAlive(this.fd, enable, secondDelay);
  }
};

ParallSocket.prototype.setTimeout = function(msecs, callback) {
  if (msecs > 0) {
    enroll(this, msecs);
    if (this.fd) { active(this); }
    if (callback) {
      this.once('timeout', callback);
    }
  } else if (msecs === 0) {
    unenroll(this);
  }
};


ParallSocket.prototype.pause = function() {
  if (this._readWatcher) this._readWatcher.stop();
};


ParallSocket.prototype.resume = function() {
  if (this.fd === null) throw new Error('Cannot resume() closed Socket.');
  if (this._readWatcher) {
    this._readWatcher.stop();
    this._readWatcher.set(this.fd, true, false);
    this._readWatcher.start();
  }
};

ParallSocket.prototype.destroySoon = function() {
  if (this.flush()) {
    this.destroy();
  } else {
    this.__destroyOnDrain = true;
  }
};

ParallSocket.prototype.destroy = function(exception) {
  // pool is shared between sockets, so don't need to free it here.
  var self = this;

  // TODO would like to set _writeQueue to null to avoid extra object alloc,
  // but lots of code assumes this._writeQueue is always an array.
  this._writeQueue = [];

  this.readable = this.writable = false;

  if (this._writeWatcher) {
    this._writeWatcher.stop();
    this._writeWatcher.socket = null;
    ioWatchers.free(this._writeWatcher);
    this._writeWatcher = null;
  }

  if (this._readWatcher) {
    this._readWatcher.stop();
    this._readWatcher.socket = null;
    ioWatchers.free(this._readWatcher);
    this._readWatcher = null;
  }

  unenroll(this);

  // FIXME Bug when this.fd == 0
  if (typeof this.fd == 'number') {
    close(this.fd);
    this.fd = null;
    process.nextTick(function() {
      if (exception) self.emit('error', exception);
      self.emit('close', exception ? true : false);
    });
  }
};

ParallSocket.prototype.send = sendImpl;

// 
ParallSocket.prototype._sendmsg = function(msg, queueOnFail) {
  var flushed;
  
  if (this._sendqueue.length) {
    queueOnFail && this._sendqueue.push(msg);
    return false;
  }
  
  if (!(flushed = this._writemsg(msg)) && !msg._off) {
    queueOnFail && this._sendqueue.unshift(msg);
  }
  
  return flushed;
};


ParallSocket.prototype._writemsg = function(msg) {
  var bytes;

  try {
    bytes = this._writeImpl( msg
                           , msg._off
                           , msg.length - msg._off
                           , msg._fd
                           , 0);
  } catch (e) {
    this.destroy(e);
    return false;
  }
  
  if (bytes != msg.length) {
    return true;
  } 

  msg._off = byteswritten;

  // Partly written messages MUST be queued
  this._sendqueue.unshift(msg);

  this._writeWatcher.start();
  
  return false;
}

// Flushes the write buffer out.
// Returns true if the entire buffer was flushed.
ParallSocket.prototype.flush = function() {
  while (this._sendqueue && this._sendqueue.length) {
    var msg = this._sendqueue.shift();
    var flushed = this._writemsg(msg);
    if (!flushed) return false;
  }
  if (this._writeWatcher) this._writeWatcher.stop();
  return true;
};


ParallSocket.prototype._shutdown = function() {
  if (!this.writable) {
    throw new Error('The connection is not writable');
  } else {
    // readable and writable
    this.writable = false;

    if (this.readable) {

      try {
        this._shutdownImpl();
      } catch (e) {
        this.destroy(e);
      }
    } else {
      // writable but not readable
      this.destroy();
    }
  }
};


function RequesterSocket(opts) {
  var opts = Object.create(options || {}, null);
  ParallSocket.call(this, opts);
  
  this._outgoingmax = opts.maxOutgoingRequests || MAX_OUTGOING_REQUESTS;
  this._outgoingcount = 0;
  this._ackwaitpool = {};
}

inherits(RequesterSocket, ParallSocket);

RequesterSocket.prototype.send = function() {
  var self = this;
  var args = slice.call(arguments);
  var handler;
  var graph;
  
  function callback(err, msg) {
    
    if (err) {
      if (handler) {
        handler(null, 'ERROR', err.message || err.toString());
      } else {
        self.emit("error", err);
      }
    } else if ((msg[FLAG_OFFSET] & REJECT) == REJECT) {
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
            handler.call(self, msg, graph[0], graph[0]);
            break;

          case 3:
            handler.call(self, msg, graph[0], graph[0], graph[0]);
            break;

          case 4:
            handler.call(self, msg, graph[0], graph[0], graph[0], graph[0]);
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
  
  if (typeof args[args.length] == "function") {
    usercb = args[args.length];
    args[args.length] = callback;
  } else {
    args.push(callback);
  }
  
  return sendImpl.apply(this, args);
}

RequesterSocket.prototype._processMessage = function(msg) {
  var waitpool = this._ackwaitpool;
  var ack = msg[ACK_OFFSET];
  var req = waitpool[ack];
  var ackfree = false;

  // Ignore message if we currently doesn't have a
  // corresponding wait handle or messages that is flaged as
  // OPTION. 
  if (!req || (raw[FLAG_OFFSET] & OPTION) == OPTION) {
    return;
  }
  
  // Free ack handle in socket wait pool
  waitpool[ack] = void(0);
  ackfree = (this._outgoingcount-- == this._outgoingmax);
	
  // Push socket back to socket if not write queue is full
  // and currently not in list.
  // if (!socket._waitingForFlush && ackfree) {
  //   sockets.push(socket);
  // }
  
  req._callback && req._callback(msg);
}

function ResponderSocket() {
  var opts = Object.create(options || {}, null);
  ParallSocket.call(this, opts);
}

ResponderSocket.prototype.send = function() {
  throw new Error("ResponderSocket does not implement send");
};

ResponderSocket.prototype._processMessage = function(msg) {
  var msg;
  
  if (!this._events || 
      !this._events["message"]) {
    return;
  }
  
  implementAckMethods(msg, socket);

  this.emit("message", msg);  
};


function SubscriberSocket() {
  var opts = Object.create(options || {}, null);
  ParallSocket.call(this, opts);
}

SubscriberSocket.prototype._processMessage = function(msg) {
  
  if ((msg[FLAG_OFFSET] & OPTION) == OPTION || !this._events) {
    // Ignore OPTION messages. The SubscriberSocket does not
    // support options for now.
    
    return;
  }

  this._events["rawmessage"] && this.emit("rawmessage", msg);

  if (this._events["message"] && raw.length > PAYLOAD_OFFSET) {
    this.emit("message", msg, msg.graph);
  }
  
};


// ConnectWorker([socket], [port], [host])
function ConnectWorker(socket, port, host) {
  var slots = ConnectWorker.slots;
  var slotno;
  
  if (socket) {
    // Add socket to waitpool. New sockets is always
    // added with max priority.
    
    slotno = Math.floor(socket._reconnectAttempt / ATTEMPTS_PER_SLOT);
    
    if (slotno >= MAX_RECONNECT_SLOTS) {
      slotno = MAX_RECONNECT_SLOTS - 1;
    }
    
    ConnectWorker.count++;
    
    socket._reconnectSlotNo = slotno;
    
    slots[slotno].push([socket, port, host]);
  }

  if (ConnectWorker.handler) {
    // Do not start two instances of the connectWorker. But, we 
    // want to prioritize new added sockets. Restart timer with
    // lower delay if a new socket was added.
    
    if (socket && socket._reconnectAttempt == 0) {
      clearTimeout(ConnectWorker.handler);
      ConnectWorker.handler = setTimeout(handlerloop, 0);
    }
    return;
  }
  
  ConnectWorker.running = true;
  
  function handlerloop() {
    var morejobs = false;
    var jobs = slots.shift();

    // Always reset handler in begining, if an error 
    // occures in the middle of something.
    ConnectWorker.handler = null;
    
    ConnectWorker.count -= jobs.length;
    
    // Connect the actual socket(s).
    jobs.forEach(function(args) { ConnectWorker.connect.apply(args) });
    
    // Check if there is more jobs in the queue.
    morejobs = slots.some(function(jobs) { return jobs.length > 0 });

    // Add the slot that we removed with `shift` above.
    slots.push([]);

    // Start the loop again, if more jobs are waiting.
    morejobs && handler = setTimeout(handlerloop, RECONNECT_INTERVAL);
    
  });
  
  ConnectWorker.handler = setTimeout(handlerloop, 0);
}

ConnectWorker.handler = null;
ConnectWorker.count = 0;
ConnectWorker.slots = MAX_RECONNECT_SLOTS.map(function() { return [] });

ConnectWorker.connect = function(socket, port, host) {
  
  // Reset slot no
  socket._reconnectSlotNo = null;

  active(socket);
  
  // Handles socket connection errors. Try toreconnect, if 
  // possible, else destroy.
  function onerror(err) {
    var slotno;
    
    socket.removeEventListener("error", onerror);
    
    if (socket._reconnectMaxAttempts == socket._reconnectAttempt) {
      socket.on("error", err);
    } else {
      socket._reconnectAttempt++;
      ConnectWorker(socket, port, host);
    }
  }

  if (socket.type == "tcp") {
    require('dns').lookup(url.hostname, function(err, ip, addressType) {
      
      if (err) {
        onerror(err);
        return;
      }

      active(socket);
      
      socket.type = addressType == 4 ? 'tcp4' : 'tcp6';
      socket.fd = socket(self.type);

      ConnectWorker.connect(socket, port, ip);
    });
    return;
  } 

  try {
    connect(socket.fd, port, host);
  } catch (e) {
    onerror(e);
    return;
  }

  // Don't start the read watcher until connection is established
  socket._readWatcher.set(socket.fd, true, false);

  // How to connect on POSIX: Wait for fd to become writable, then call
  // socketError() if there isn't an error, we're connected. AFAIK this a
  // platform independent way determining when a non-blocking connection
  // is established, but I have only seen it documented in the Linux
  // Manual Page connect(2) under the error code EINPROGRESS.
  socket._writeWatcher.set(socket.fd, false, true);
  socket._writeWatcher.start();
  
  socket.on("error", onerror);
}