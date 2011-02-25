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
    , timers                = require('timers').active
    , notEqual              = require("assert").notEqual

const recvMsg               = process.binding("net").recvMsg
    , socket                = process.binding("net").socket
    , bind                  = process.binding("net").bind
    , connect               = process.binding("net").connect
    , listen                = process.binding("net").listen
    , accept                = process.binding("net").accept
    , close                 = process.binding("net").close;

const IOWatcher             = process.binding('io_watcher').IOWatcher;

const createProcSockAlias   = require("./utils").createProcSockAlias
    , parseUrl              = require("./utils").parseUrl

const ENOENT                = process.binding('constants').ENOENT
    , EMFILE                = process.binding('constants').EMFILE
    

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

exports.createChannel = function(type, options) {
  switch (type) {
    case "resp": return new (require("./resp")).RespChannel(options || {});
    case "req": return new (require("./req")).ReqChannel(options || {});
    case "sub": return new (require("./sub")).SubChannel(options || {});
    case "pub": return new (require("./pub")).PubChannel(options || {});
    default: throw new Error("Invalid channel type: " + type);
  }
};

Object.defineProperty(Channel.prototype, 'sockets', {
  get: function() {
    return this._sockets.slice(0);
  }
});

Channel.prototype.attach = function(sock) {
  if (sock instanceof this.SocketClass) {
    this._attachSocket(sock);
    sock.resume();
  } else {
    throw new Error("`socket` cannot be attached to this channel type.");
  }
};


Channel.prototype.connect = function(url, callback) {
  var sock;

  sock = new this.SocketClass();
  sock.connect(url);

  if (callback) {
    // TODO: Add callback handler to Error
  }
  
  this._attachSocket(sock);
}

Channel.prototype.listen = function(url, callback) {
  var self = this;
  var parsedurl;
  var resource;
  var type;
  var port;

  
  if (this.closing || this.closed) {
    throw new Error("Channel is closing/closed");
  }
  
  parsedurl = parseUrl(url, true);
  
  if (parsedurl == null) {
    throw new Error("Invalid URL `" + url + "`");
  }
    
  switch (parsedurl.protocol) {
    
    case "proc":
      resource = createProcSockAlias(parsedurl.resource);

    case "sock":
      type = "unix";
      resource = resource || parsedurl.resource;
      break;
    
    case "tcp":
      type = "tcp";
      resource = parsedurl.resource;
      port = parsedurl.port;
      break;
      
    case "mem":
      type = "mem";
      resource = parsedurl.resource;
      break;

  }

  this._doListen(null, type, resource, port, function(err) {
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

  if (type === "mem") {
    
    process.nextTick(function() {
      var fd;
      
      if (self.closing || self.closed) {
        return;
      }    

      fd = require("./memsock").socket();
      
      try {
        require("./memsock").bind(fd, host);
      } catch (err) {
        require("./memsock").close(fd);
        callback(err);
        return;
      }
      
      self._attachWatcher(fd, "mem", host);
      callback(null);
    });

    return;
  }

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

  process.nextTick(function() {
    // Need to the listening in the nextTick so that people potentially have
    // time to register 'listening' listeners.

    if (self.closing || self.closed) {
      // It could be that server.close() was called between the time the
      // original listen command was issued and this. Bail if that's the case.
      // See test/simple/test-net-eaddrinuse.js

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

    if (watcher.fd) {
      close(watcher.fd);
      watcher.fd = null;
    }

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
  var connectemitted = false;
  
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
        connectemitted = true;
        self.emit("connect", this);
      }
    });
  } else {
    // Socket connection is already estabilished, 
    // raise `connect` event.

    connectemitted = true;
    self.emit("connect", socket);
  }
  
  // Remove socket from `_sockets` when socket
  // is destroyed. Raise ´close´ if channel is closing,
  // and all sockets are disconnected.
  socket.once("close", function() {
    var index = sockets.indexOf(this);
    notEqual(index, -1);
    sockets.splice(index, 1);
    
    if (connectemitted) {
      // Do not emit `disconnect` if `connect` wasn't 
      // emitted

      self.emit("disconnect", socket);
    }
    
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
  var doaccept;
  var watcher;
  
  if (type == "mem") {
    doaccept = require("./memsock").accept;
    watcher = new (require("./memsock")).IOWatcher();
  } else {
    doaccept = accept;
    watcher = new IOWatcher();
  }
  
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
        info = doaccept(this.fd);
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
