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
//  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
//  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
//  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
//  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
//  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
//  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
//  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
var Stream                = require("stream").Stream
  , FreeList              = require('freelist').FreeList
  , Buffer                = require("buffer").Buffer
  , EventEmitter          = require("events").EventEmitter
  , inherits              = require("util").inherits
  , enroll                = require("timers").enroll
  , unenroll              = require("timers").unenroll
  , active                = require('timers').active
  , notEqual              = require("assert").notEqual
  , ok                    = require("assert").ok;

var slice                 = Array.prototype.slice;

var createProcSockAlias   = require("./util").createProcSockAlias
  , parseUrl              = require("./util").parseUrl
  , parseMessage          = require("./message").parseMessage
  , Message               = require("./message").Message;

var sendMsg               = process.binding("net").sendMsg
  , recvMsg               = process.binding("net").recvMsg
  , socket                = process.binding("net").socket
  , bind                  = process.binding("net").bind
  , connect               = process.binding("net").connect
  , close                 = process.binding("net").close
  , shutdown              = process.binding("net").shutdown
  , read                  = process.binding("net").read
  , write                 = process.binding("net").write
  , toRead                = process.binding("net").toRead
  , setNoDelay            = process.binding("net").setNoDelay
  , setKeepAlive          = process.binding("net").setKeepAlive
  , socketError           = process.binding("net").socketError
  , getsockname           = process.binding("net").getsockname
  , errnoException        = process.binding("net").errnoException;

var IOWatcher             = process.binding('io_watcher').IOWatcher;

var ENOENT                = process.binding("constants").ENOENT;
var EMFILE                = process.binding("constants").EMFILE;
var EINPROGRESS           = process.binding("constants").EINPROGRESS ||
                            process.binding("constants").WSAEINPROGRESS;

var LENGTH_OFFSET         = require("./message").LENGTH_OFFSET
  , LENGTH_SIZE           = require("./message").LENGTH_SIZE
  , FLAG_OFFSET           = require("./message").FLAG_OFFSET
  , FLAG_SIZE             = require("./message").FLAG_SIZE
  , ACK_OFFSET            = require("./message").ACK_OFFSET
  , PAYLOAD_OFFSET        = require("./message").PAYLOAD_OFFSET;

var MAX_RECONNECT_SLOTS   = [1, 2, 3, 4, 5]
  , ATTEMPTS_PER_SLOT     = 5
  , RECONNECT_INTERVAL    = 300;


var ioWatchers = new FreeList('iowatcher', 100, function(type) {
  if (type == "mem") {
    return new (require("./memsock")).IOWatcher();
  } else {
    return new IOWatcher();
  }
});

function setImplmentationMethods(socket) {
  var memRead;
  var memWrite;

  socket._sizebuffer = new Buffer(LENGTH_SIZE);
  socket._sizebuffer._off = 0;
  socket._currbuffer = socket._sizebuffer;

  if (socket.type == "unix") {

    socket._writeImpl = function(buf, off, len, fd, flags) {
      // We do not need Nodejs's noData impl. here, because
      // our messages always contains a payload.

      return sendMsg(this.fd, buf, off, len, fd, flags);
    };

    socket._readImpl = function(buf, off, len, calledByIOWatcher) {
      var bytesread = recvMsg(socket.fd, buf, off, len);

      if (recvMsg.fd !== null) {
        socket._pendingfd = recvMsg.fd;
      }

      return bytesread;
    };
  } else if (socket.type == "mem") {

    memWrite = require("./memsock").write;
    memRead = require("./memsock").read;

    socket._writeImpl = function(buf, off, len, fd, flags) {
      return memWrite(this.fd, buf, off, len);
    };

    socket._readImpl = function(buf, off, len, calledByIOWatcher) {
      return memRead(this.fd, buf, off, len);
    };

    return;
  } else {

    socket._writeImpl = function(buf, off, len, fd, flags) {
      // XXX: TLS support requires that 0-byte writes get processed
      //      by the kernel for some reason. Otherwise, we'd just
      //      fast-path return here.

      // Drop 'fd' and 'flags' as these are not supported by the write(2)
      // system call

      return write(socket.fd, buf, off, len);
    };

    socket._readImpl = function(buf, off, len) {
      return read(this.fd, buf, off, len);
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

function initSocket(self, type) {
  self._readWatcher = ioWatchers.alloc(type);
  self._readWatcher.socket = self;
  self._readWatcher.callback = onReadable;
  self.readable = false;

  self._sendqueue = [];

  self._writeWatcher = ioWatchers.alloc(type);
  self._writeWatcher.socket = self;
  self._writeWatcher.callback = onWritable;
  self.writable = false;
}

exports.createSocket = function(type, options) {
  switch (type) {
    case "resp": return new (require("./resp")).RespSocket(options);
    case "req": return new (require("./req")).ReqSocket(options);
    case "sub": return new (require("./sub")).SubSocket(options);
    case "pub": return new (require("./pub")).PubSocket(options);
    default: throw new Error("Invalid channel type: " + type);
  }
};

// More or less a rip-off of node/net/Socket. There is too many
// implementations methods that we need to override, so it is
// easier to host our own.
function Socket(opts) {
  Stream.call(this);

  this.id = opts.id || null;

  this.fd = null;
  this.type = null;

  this.fd = opts.fd !== undefined ? parseInt(opts.fd, 10) : null;
  this.type = opts.type || null;

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

exports.Socket = Socket;
inherits(Socket, Stream);

Object.defineProperty(Socket.prototype, 'readyState', {
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

Socket.prototype._onTimeout = function() {
  this.emit('timeout');
};

Socket.prototype._onReadable = function() {
  var buffer = this._currbuffer;
  var off = buffer._off;
  var tmpbuffer;
  var bytesread;
  var msg;

  try {
    bytesread = this._readImpl(buffer, off, buffer.length - off);
  } catch (e) {
    this.destroy(e);
    return;
  }

  if (bytesread === 0) {
    this.readable = false;
    this._readWatcher.stop();

    if (!this.writable) {
      this.destroy();
    } else {
      this._shutdown();
    }
    return;
  }

  active(this);

  buffer._off += bytesread;

  // We got the size of the message. We can now allocate a new message
  // buffer and start receive to that instead. Else wait for the actual
  // message size. wait for morebytes...
  //
  // Else, wait for all bytes in message to be read. Then notify channel
  // that a new message is waiting.
  if (buffer._off == LENGTH_SIZE) {
    tmpbuffer = new Message((buffer[0] * 256) + buffer[1], this);
    tmpbuffer[0] = buffer[0];
    tmpbuffer[1] = buffer[1];

    // Reset pos for next read.
    buffer._off = 0;

    tmpbuffer._off = 2;
    this._currbuffer = tmpbuffer;
  } else if (buffer._off === buffer.length) {
    // Message buffer is full, parse message part

    if ((msg = parseMessage(buffer, this))) {
      msg.origin = this;
      this._processMessage(msg);
    }

    // Read next message buffer
    this._currbuffer = this._sizebuffer;
  }

};

Socket.prototype._onWritable = function() {
  // Socket becomes writable on connect() but don't flush if there's
  // nothing actually to write
  if (this.flush()) {
    if (this._events && this._events.drain) this.emit("drain");
    if (this.ondrain) this.ondrain(); // Optimization
    if (this.__destroyOnDrain) this.destroy();
  }
};


Socket.prototype._onConnect = function() {
  var errno = 0;

  if (this.type != "mem") {
    errno = socketError(this.fd);
  }

  if (errno === 0) {
    // connection established
    this._connecting = false;
    this.resume();
    ok(this.writable);
    this.readable = this.writable = true;
    try {
      this.emit('connect');
    } catch (e) {
      this.destroy(e);
      return;
    }


    if (this._sendqueue && this._sendqueue.length) {
      // Flush this in case any writes are queued up while connecting.
      this._onWritable();
    }

  } else if (errno != EINPROGRESS) {
    this.emit("connectError", errnoException(errno, 'connect'));
  }
};

Socket.prototype.open = function(fd, type) {
  initSocket(this, type);

  this.fd = fd;
  this.type = type || null;
  this.readable = true;

  setImplmentationMethods(this);

  this._writeWatcher.set(this.fd, false, true);
  this.writable = true;
};


// Override Socket.connect
Socket.prototype.connect = function(url) {
  var lastarg = arguments[arguments.length - 1];
  var parsedurl;
  var resource;
  var port;

  if (this.fd) {
    throw new Error("Socket already opened");
  }

  parsedurl = parseUrl(url, false);

  if (!parsedurl) {
    throw new Error("Invalid URL `" + url + "`");
  }

  initSocket(this, parsedurl.protocol);


  if (!this._readWatcher) {
    throw new Error('No readWatcher');
  }

  if (typeof lastarg == 'function') {
    self.addListener('connect', lastarg);
  }

  switch (parsedurl.protocol) {

    case "proc":
      this.fd = socket("unix");
      this.type = "unix";

      setImplmentationMethods(this);

      resource = createProcSockAlias(parsedurl.resource);
      break;

    case "sock":
      this.fd = socket("unix");
      this.type = "unix";

      setImplmentationMethods(this);

      resource = resource || parsedurl.resource;
      break;

    case "tcp":
      this.type = "tcp";
      resource = parsedurl.resource;
      port = parsedurl.port;
      break;

    case "mem":
      this.fd = require("./memsock").socket();
      this.type = "mem";

      setImplmentationMethods(this);

      resource = parsedurl.resource;
      break;
  }

  this._connecting = true; // set false in doConnect
  this.writable = true;

  active(this);

  ConnectWorker(this, resource, port);
};

// Placeholder
Socket.prototype._processMessage = function() { };

Socket.prototype.address = function() {
  return getsockname(this.fd);
};


Socket.prototype.setNoDelay = function(v) {
  if ((this.type == 'tcp4') || (this.type == 'tcp6')) {
    setNoDelay(this.fd, v);
  }
};

Socket.prototype.setKeepAlive = function(enable, time) {
  if ((this.type == 'tcp4') || (this.type == 'tcp6')) {
    var secondDelay = Math.ceil(time / 1000);
    setKeepAlive(this.fd, enable, secondDelay);
  }
};

Socket.prototype.setTimeout = function(msecs, callback) {
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


Socket.prototype.pause = function() {
  if (this._readWatcher) this._readWatcher.stop();
};


Socket.prototype.resume = function() {

  if (this.fd === null) {
    throw new Error('Cannot resume() closed Socket.');
  }

  if (this._readWatcher) {
    this._readWatcher.stop();
    this._readWatcher.set(this.fd, true, false);
    this._readWatcher.start();
  }
};


Socket.prototype.destroySoon = function() {
  if (this.flush()) {
    this.destroy();
  } else {
    this.__destroyOnDrain = true;
  }
};


Socket.prototype.destroy = function(exception) {
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
    if (this.type == "mem") {
      require("./memsock").close(this.fd);
    } else {
      close(this.fd);
    }
    this.fd = null;
    process.nextTick(function() {
      if (exception) {
        self.emit('error', exception);
      }
      self.emit('close', exception ? true : false);
    });
  }
};


Socket.prototype.send = function() {
  throw new Error("Socket does not support `send´");
};


//
Socket.prototype._sendmsg = function(msg, queueOnFail) {
  var flushed;

  if (this._connecting || this._sendqueue.length) {
    queueOnFail && this._sendqueue.push(msg);
    return false;
  }

  if (!(flushed = this._writemsg(msg)) && !msg._off) {
    queueOnFail && this._sendqueue.unshift(msg);
  }

  return flushed;
};


Socket.prototype._writemsg = function(msg) {
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

  if (bytes + msg._off == msg.length) {
    return true;
  }

  msg._off += bytes;

  // Partly written messages MUST be queued

  this._sendqueue.unshift(msg);

  this._writeWatcher.start();

  return false;
};


// Flushes the write buffer out.
// Returns true if the entire buffer was flushed.
Socket.prototype.flush = function() {
  while (this._sendqueue && this._sendqueue.length) {
    var msg = this._sendqueue.shift();

    var flushed = this._writemsg(msg);
    if (!flushed) return false;
  }
  if (this._writeWatcher) this._writeWatcher.stop();
  return true;
};


Socket.prototype._shutdown = function() {
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


// ConnectWorker([socket], [port], [host])
function ConnectWorker(socket, host, port) {
  var slots = ConnectWorker.slots;
  var slotno;

  if (socket) {
    // Add socket to waitpool. New sockets is always
    // added with max priority.

    slotno = Math.floor(socket._reconnectAttempt / ATTEMPTS_PER_SLOT);

    if (slotno >= MAX_RECONNECT_SLOTS.length) {
      slotno = MAX_RECONNECT_SLOTS.length - 1;
    }

    ConnectWorker.count++;

    socket._reconnectSlotNo = slotno;

    slots[slotno].push([socket, host, port]);
  }

  if (ConnectWorker.handler) {
    // Do not start two instances of the connectWorker. But, we
    // want to prioritize new added sockets. Restart timer with
    // lower delay if a new socket was added.

    if (socket && socket._reconnectAttempt === 0) {
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
    jobs.forEach(function(args) {
      process.nextTick(function() {
        ConnectWorker.connect.apply(null, args);
      });
    });

    // Check if there is more jobs in the queue.
    morejobs = slots.some(function(jobs) { return jobs.length > 0; });

    // Add the slot that we removed with `shift` above.
    slots.push([]);

    // Start the loop again, if more jobs are waiting.
    morejobs && (handler = setTimeout(handlerloop, RECONNECT_INTERVAL));

  }

  ConnectWorker.handler = setTimeout(handlerloop, 0);
}

ConnectWorker.handler = null;
ConnectWorker.count = 0;
ConnectWorker.slots = MAX_RECONNECT_SLOTS.map(function() { return []; });

ConnectWorker.connect = function(sock, host, port) {

  // Reset slot no
  socket._reconnectSlotNo = null;

  active(sock);

  function onconnect() {
    sock.removeListener("connectError", onconnecterror);
    sock.removeListener("connect", onconnect);
    sock._reconnectAttempt = 0;
  }

  // Handles socket connection errors. Try toreconnect, if
  // possible, else destroy.
  function onconnecterror(err) {
    var slotno;

    // Stop write watcher.
    sock._writeWatcher.stop();

    sock.removeListener("connectError", onconnecterror);
    sock.removeListener("connect", onconnect);

    if (sock._reconnectMaxAttempts == sock._reconnectAttempt) {
      sock.destroy(err);
    } else {

      if (sock.type == "tcp4" || sock.type == "tcp6") {
        // Need to referesh FD for tcp connection. Else we
        // get a EINVAL, Invalid argument.
        close(sock.fd);
        sock.type = "tcp";
        sock.fd = null;
      }

      sock._reconnectAttempt++;
      ConnectWorker(sock, host, port);
    }
  }

  if (sock.type == "tcp") {
    require('dns').lookup(host, function(err, ip, addressType) {

      if (err) {
        onconnecterror(err);
        return;
      }

      active(sock);

      sock.type = addressType == 4 ? 'tcp4' : 'tcp6';
      sock.fd = socket(sock.type);

      ConnectWorker.connect(sock, ip, port);
    });
    return;
  }

  try {
    if (sock.type == "mem") {
      require("./memsock").connect(sock.fd, host);
    } else {
      connect(sock.fd, port || host, port && host || null);
    }
  } catch (e) {
    onconnecterror(e);
    return;
  }

  // Don't start the read watcher until connection is established
  sock._readWatcher.set(sock.fd, true, false);

  // How to connect on POSIX: Wait for fd to become writable, then call
  // socketError() if there isn't an error, we're connected. AFAIK this a
  // platform independent way determining when a non-blocking connection
  // is established, but I have only seen it documented in the Linux
  // Manual Page connect(2) under the error code EINPROGRESS.
  sock._writeWatcher.set(sock.fd, false, true);
  sock._writeWatcher.start();

  sock.on("connectError", onconnecterror);
  sock.on("connect", onconnect);
};