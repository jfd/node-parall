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
    , Channel               = require("./channel").Channel

const findEventListener     = require("./util").findEventListener;

function RespSocket(options) {
  var opts = options || {};
  Socket.call(this, opts);
}

exports.RespSocket = RespSocket;
inherits(RespSocket, Socket);

RespSocket.prototype.send = function() {
  throw new Error("RespSocket does not implement send");
};

RespSocket.prototype._processMessage = function(msg) {

  if (!this._events || 
      !this._events["message"]) {
    return;
  }

  this.emit("message", msg);  
};

// Initializes a new ResponderChannel instance.
function RespChannel() {
  Channel.call(this, "resp");

  this.on("connect", this._onconnectRespChannel);
  this.on("disconnect", this._ondisconnectRespChannel);
}

exports.RespChannel = RespChannel;
inherits(RespChannel, Channel);

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