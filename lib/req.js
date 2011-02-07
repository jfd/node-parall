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
    , notEqual              = require("assert").notEqual

const slice                 = Array.prototype.slice;

const Socket                = require("./socket").Socket
    , Channel               = require("./channel").Channel

const createMessage         = require("./message").createMessage
    , sendImpl              = require("./message").sendImpl

const ACK_OFFSET            = require("./message").ACK_OFFSET

const SQ_FLUSH_INTERVAL     = 300;
const MAX_OUTGOING_REQUESTS = 255;

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
  var handler;
  var graph;

  function callback(err, msg) {
    
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
  
  if (typeof args[args.length - 1] == "function") {
    handler = args.pop();
  } 

  return sendImpl.call(this, args, callback);
};


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
	
  req._callback && req._callback(null, msg);
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

// Initializes a new ReqChannel instance.
function ReqChannel() {
  Channel.call(this, "req");

  this._requestQueue = [];
  this._readySockets = [];
  this._requestQueueJobRunning = false;
  
  this._sideQueue = [];
  this._sideQueueJobRunning = false;

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