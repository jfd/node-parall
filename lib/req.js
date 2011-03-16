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

const inherits              = require("util").inherits
    , notEqual              = require("assert").notEqual;

const slice                 = Array.prototype.slice;

const Socket                = require("./socket").Socket
    , Channel               = require("./channel").Channel;

const createMessage         = require("./message").createMessage
    , createComplexMessage  = require("./message").createComplexMessage;
    
const defineDispatcher      = require("./util").defineDispatcher;

const ACK_OFFSET            = require("./message").ACK_OFFSET

const SQ_FLUSH_INTERVAL     = 300;
const MAX_OUTGOING_REQUESTS = 255;
const MAX_REJECTS           = 6;

function ReqSocket(options) {
  var opts = options || {};
  Socket.call(this, opts);
  
  this._outgoingmax = opts.maxOutgoingRequests || MAX_OUTGOING_REQUESTS;
  this._outgoingcount = 0;
  this._ackwaitpool = {};
}

exports.ReqSocket = ReqSocket;
inherits(ReqSocket, Socket);

ReqSocket.prototype.hasAvailableHandlers = function() {
  return this._outgoingcount < this._outgoingmax;
};

ReqSocket.prototype.send = function() {
  var self = this;
  var args = slice.call(arguments);
  var graph;
  var name;
  var req;

  req = createRequest(args);

  req.__handler__ = function(err, msg) {
    try {
      if (err) {
        if (this.__recv__("ERROR", err.toString(), err.stack) == -1) {
          throw new Error("No dispatch route for `ERROR/2`");
        }
      } else if (msg.rejected) {
        if (this.__recv__("REJECT") == -1) {
          throw new Error("No dispatch route for `REJECT/0`");
        }
      } else {
        graph = msg.graph;
        
        if (graph instanceof Buffer) {
          if (this.__recv__.call(this, "", msg, graph) == -1) {
            throw new Error("No dispatch route for `/2`");
          }
        } else {
          name = graph.shift();
          graph.unshift(msg);
          graph.unshift(name);
          if (this.__recv__.apply(this, graph) == -1) {
            throw new Error("No dispatch route for `" + 
                            name + "/" + (graph.length - 1) + "`");
          }
        }
      }
    } catch (dispatchException) {
      self.destroy(dispatchException);
    }
  };
  
  this._sendmsg(req, true);
  
  return req;
};


function createRequest(graph) {
  var req;

  if (graph[0] instanceof Buffer) {
    // Fast messages, call create message on the buffer.

    req = createMessage(graph[0], 0 ,0);
  } else {
    // Complex messages, is of course more complex, and
    // requires more time to process.

    req = createComplexMessage(graph, 0, 0);
  }

  defineDispatcher(req, "recv");
  
  return req;
}

ReqSocket.prototype._writemsg = function(msg) {
  var waitpool = this._ackwaitpool;
  var bytes;
  var ack;
  var newmsg;
  
  ack = msg[ACK_OFFSET];

  if (ack == 0) {
      // Find free ack no for this msg

      ack = this._outgoingmax + 1;
      while (ack-- && waitpool[ack]) { }

      notEqual(ack, 0);

      // Note: This should never happen, because we remove the
      //       socket from readyRemoteEndpoints.
      if (ack == 0) {
        return false;
      }

      // Set message ack to the one generated.
      msg[ACK_OFFSET] = ack;
    
  } else {
    ack = 0;
  }

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
  
  if (ack) {
    // Only add new mesages to waitpool.

    waitpool[ack] = msg;

    msg.socket = this;
    this._outgoingcount++;
  }

  if (bytes + msg._off == msg.length) {
    return true;
  } 

  msg._off += bytes;

  // Partly written messages MUST be 
  // queued again.
  this._sendqueue.unshift(msg);

  this._writeWatcher.start();
  
  return false;
};


ReqSocket.prototype._processMessage = function(msg) {
  var waitpool = this._ackwaitpool;
  var ack = msg[ACK_OFFSET];
  var req = waitpool[ack];
  var ackfree = false;

  // Ignore message if we currently doesn't have a
  // corresponding wait handle or messages that is flaged as
  // OPTION. 
  if (!req || msg.option) {
    return;
  }
  

  // Free ack handle in socket wait pool
  waitpool[ack] = void(0);
  ackfree = (this._outgoingcount-- == this._outgoingmax);
  
  if (ackfree && !this._waitingforflush) {
    this._events && this._events['drain'] && this.emit('drain');
    this.ondrain && this.ondrain();
    this.__destroyOnDrain && this.destroy();
  }

  req.__handler__(null, msg);
}

// ReqSocket needs it's own implementation of _onWritable
// because of the fact that the socket shouldn't be `drain`-ed 
// if there is out of acks.
ReqSocket.prototype._onWritable = function() {
  this._waitingforflush = false;
  if (this.flush()) {
    if (this._outgoingcount < this._outgoingmax) {
      this._events && this._events['drain'] && this.emit('drain');
      this.ondrain && this.ondrain();
      this.__destroyOnDrain && this.destroy();
    }
  } else {
    this._waitingforflush = true;
  }
};

ReqSocket.prototype.destroy = function(exception) {
  var waitpool = this._ackwaitpool;
  var req;
  var keys;
  var index;
  
  Socket.prototype.destroy.call(this, exception);
  
  if (!this.channel && waitpool) {
    keys = Object.keys(waitpool);
    index = keys.length;

    while (index--) {
      if ((req = waitpool[keys[index]])) {
        req.__handler__(exception || new Error("Destroyed by user"));
      }
    }

    this._ackwaitpool = null;
  }
};

// Initializes a new ReqChannel instance.
function ReqChannel(options) {
  Channel.call(this, "req");

  this._requestQueue = [];
  this._readySockets = [];
  this._requestQueueJobRunning = false;
  
  this._sidequeue = [];
  this._sidequeue.running = false;
  
  this._rejectflushinterval = options.rejectFlushInterval || SQ_FLUSH_INTERVAL;
  this._maxrejects = options.maxRejects || MAX_REJECTS;

  this.on("connect", this.RequesterImpl_connect);
  this.on("disconnect", this.RequesterImpl_disconnect);
}

exports.ReqChannel = ReqChannel;
inherits(ReqChannel, Channel);

ReqChannel.prototype.SocketClass = ReqSocket;

ReqChannel.prototype.RequesterImpl_connect = function(sock) {

  this._readySockets.push(sock);

  if (this._requestQueue.length && !this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
};

ReqChannel.prototype.RequesterImpl_disconnect = function(sock) {
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
};

ReqChannel.prototype.send = function() {
  var self = this;
  var args = slice.call(arguments);
  var rejectCount = 0;
  var graph;
  var name;
  var req;
  
  req = createRequest(args);

  req.__handler__ = function(err, msg) {

    try {
      if (err) {
        if (this.__recv__("ERROR", err.toString(), err.stack) == -1) {
          throw new Error("No dispatch route for `ERROR/2`");
        }
      } else if (msg.rejected) {
        if (++rejectCount == self._maxrejects) {
          if (this.__recv__("REJECT") == -1) {
            throw new Error("No dispatch route for `REJECT/0`");
          }
        } else {
          self._sidequeue.push(req);
          self._startSideQueueJob();
        }
      } else {

        graph = msg.graph;

        if (graph instanceof Buffer) {
          if (this.__recv__.call(this, "", msg, graph) == -1) {
            throw new Error("No dispatch route for `/2`");
          }
        } else {
          name = graph.shift();
          graph.unshift(msg);
          graph.unshift(name);
          if (this.__recv__.apply(this, graph) == -1) {
            throw new Error("No dispatch route for `" + 
                            name + "/" + (graph.length - 1) + "`");
          }
        }
      }
    } catch (dispatchException) {
      self.emit("error", dispatchException);
    }
    
    if (!self._requestQueueJobRunning) {
    	self._startRequestQueueJob();
    }
  };
  
  this._sendmsg(req, true);
  
  return req;
};

ReqChannel.prototype._attach = Channel.prototype.attach;
ReqChannel.prototype.attach = function(sock) {
  
  if (sock && !sock.fd && sock.constructor !== ReqSocket) {
    // Worker sockets can be attached, without 
    // being connecting. If so, connect worker. 

    sock.connect();
  }
  
  this._attach(sock);
};

ReqChannel.prototype._sendmsg = function(msg, queueOnFail) {
  
  this._requestQueue.push(msg);
  
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
};

ReqChannel.prototype._startRequestQueueJob = function() {
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

ReqChannel.prototype._startSideQueueJob = function() {
  var sidequeue = this._sidequeue;
  var self = this;
  
  if (sidequeue.running) {
    return;
  }

  sidequeue.running = true;

  setTimeout(function() {
    var queue = self._requestQueue;

    for (var i = 0, l = sidequeue.length; i < l; i++) {
      queue.push(sidequeue[i]);
    }

    self._sidequeue = [];
    self._sidequeue.running = false;
    
    if (!self._requestQueueJobRunning) {
    	self._startRequestQueueJob();
    }
    
  }, this._rejectflushinterval);
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
      
      // ACK must be reset before sending it to socket.
      msg[ACK_OFFSET] = 0;

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

        !fullsockets && (fullsockets = []);
        fullsockets.push(socket);
        
        if (!msg._off) {
          // Message was not queued to sockets sendqueue. Try
          // next socket.

          continue;
        }
        
      }

      // Message is handled, break loop
      msg = null;
      break;
    }
    
    if (msg !== null) {
      // Message was not handled. Add it back to queue
      queue.unshift(msg);
      return fullsockets;
    }
  }

	return fullsockets;
}