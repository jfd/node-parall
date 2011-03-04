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

const Socket                = require("./socket").Socket
    , Channel               = require("./channel").Channel;
    
const createMessage         = require("./message").createMessage
    , createComplexMessage  = require("./message").createComplexMessage;

const findEventListener     = require("./util").findEventListener
    , defineDispatcher      = require("./util").defineDispatcher;

const ACK_OFFSET            = require("./message").ACK_OFFSET;

function RespSocket(options) {
  var opts = options || {};
  Socket.call(this, opts);
}

exports.RespSocket = RespSocket;
inherits(RespSocket, Socket);

defineDispatcher(RespSocket.prototype, "receive");

RespSocket.prototype.send = function() {
  throw new Error("RespSocket does not implement send");
};

RespSocket.prototype._processMessage = function(msg) {
  var target;
  var graph;

  if (msg.option) {
    // Ignore OPTION messages. The SubSocket does not
    // support options for now.
    
    return;
  }

  initRequest(msg);
  
  target = this.channel || this;

  try {
    
    graph = msg.graph;
    
    if (graph instanceof Buffer) {
      if (target.__receive__.call(target, "", msg, graph) == -1) {
        msg.error("No dispatch route for `/2`");
      }
    } else {
      name = graph.shift();
      graph.unshift(msg);
      graph.unshift(name);
      if (target.__receive__.apply(target, graph) == -1) {
        msg.error("No dispatch route for `" + name + "/" + 
                  (graph.length - 1) + "`");
      }
    }
  } catch (receiveError) {
    // TODO: Send back a response with an error
    
    this.destroy(receiveError);
  }
};

function initRequest(self) {

  self.reject = function() {
    var buffer;
    var ack;
    var origin;

    if ((ack = this[ACK_OFFSET]) == 0 || !(origin = this.origin)) {
      throw new Error("Cannot reject a message that doesnt expect a response.");
    }

    if (this._handled) {
      throw new Error("A response has already been sent for message.");
    }

    this._handled = true;

    buffer = createMessage(null, REJECT, ack);

    origin._sendmsg(buffer, true);
  };


  self.send = function() {
    var graph = Array.prototype.slice.call(arguments);
    var reply;
    var ack;
    var origin;

    if ((ack = this[ACK_OFFSET]) == 0 || !(origin = this.origin)) {
      throw new Error("Cannot reject a message that doesnt expect a response.");
    }

    if (this._handled) {
      throw new Error("A response has already been sent for message.");
    }

    this._handled = true;

    if (graph.length == 0) {
      return;
    }

    if (graph[0] instanceof Buffer) {
      reply = createMessage(graph[0], 0 , ack);
    } else {
      reply = createComplexMessage(graph, 0, ack);
    }

    return origin._sendmsg(reply, true);
  };
  
  self.error = function(msg) {
    return this.send('ERROR', msg);
  };

  self.ok = function() {
    return this.send('OK');
  };
  
}

// Initializes a new ResponderChannel instance.
function RespChannel() {
  Channel.call(this, "resp");

  this.on("connect", this._onconnectRespChannel);
  this.on("disconnect", this._ondisconnectRespChannel);
}

exports.RespChannel = RespChannel;
inherits(RespChannel, Channel);

defineDispatcher(RespChannel.prototype, "receive");

RespChannel.prototype.SocketClass = RespSocket;

RespChannel.prototype._onconnectRespChannel = function(sock) {
  var self = this;
  
  function onmessage(msg) {
    self.emit("message", msg);
  }
  
  onmessage.owner = this;

  sock.on("message", onmessage);
}

RespChannel.prototype._ondisconnectRespChannel = function(sock) {
  var onmessage;

  onmessage = findEventListener(sock, "message", this);
  notEqual(onmessage, void(0));
  sock.removeListener("message", onmessage);
}