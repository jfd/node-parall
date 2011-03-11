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
    , Buffer                = require("buffer").Buffer

const Socket                = require("./socket").Socket
    , Channel               = require("./channel").Channel

const findEventListener     = require("./util").findEventListener
    , defineDispatcher      = require("./util").defineDispatcher
    , createOptionMessage   = require("./message").createOptionMessage


// Option Types
const SUBSCRIBE             = 0x01
    , UNSUBSCRIBE           = 0x02
    , INCLUDE               = 0x03
    , EXCLUDE               = 0x04


function SubSocket(options) {
  var opts = options || {};
  Socket.call(this, opts);
  
  this._exclusions = {};
  this._rawsubscriptions = {};
}

exports.SubSocket = SubSocket;
inherits(SubSocket, Socket);

defineDispatcher(SubSocket.prototype, "recv");

SubSocket.prototype.exclude = function(source) {
  var msg = null;
  
  if (typeof source !== "string" || source.length == 0) {
    throw new Error("Expected `source` as `String`");
  }
  
  if (!this._exclusions[source]) {

    this._exclusions[source] = true;
    
    msg = createOptionMessage(new Buffer(source, "binary"), EXCLUDE);
    
    return this._sendmsg(msg, true);
  }
  
  return false;
};

SubSocket.prototype.include = function(source) {
  var msg = null;
  
  if (typeof source !== "string" || source.length == 0) {
    throw new Error("Expected `source` as `String`");
  }
  
  if (this._exclusions[source]) {

    delete this._exclusions[source];
    
    msg = createOptionMessage(new Buffer(source, "binary"), INCLUDE);
    
    return this._sendmsg(msg, true);
  }
  
  return false;
};

SubSocket.prototype.subscribe = function(pattern) {
  var msg = null;
  var key;
  
  if (Buffer.isBuffer(pattern) == false) {
    throw new Error("Expected `pattern` as `Buffer`");
  }

  key = Buffer.toString("binary");

  if (!this._rawsubscriptions[key]) {

    this._rawsubscriptions[key] = true;
    
    msg = createOptionMessage(pattern, SUBSCRIBE);
    
    return this._sendmsg(msg, true);
  }
  
  return false;
};

SubSocket.prototype.unsubscribe = function(pattern) {
  var msg = null;
  var key;
  
  if (Buffer.isBuffer(pattern) == false) {
    throw new Error("Expected `pattern` as `Buffer`");
  }
  
  key = Buffer.toString("binary");
  
  if (this._rawsubscriptions[key]) {

    delete this._rawsubscriptions[key];
    
    msg = createOptionMessage(pattern, UNSUBSCRIBE);
    
    return this._sendmsg(msg, true);
  }
  
  return false;
};

SubSocket.prototype._processMessage = function(msg) {
  var target;

  if (msg.option) {
    // Ignore OPTION messages. The SubSocket does not
    // support options for now.
    
    return;
  }
  
  target = this.channel || this;

  try {
    target.__recv__("", msg, msg.graph);
  } catch (receiveError) {
    this.destroy(receiveError);
  }
};


// Creates a new Subscriber Channel instance
function SubChannel() {
  Channel.call(this, "sub");

  this._rawsubscriptions = {};
  this._exclusions = {};

  this.on("connect", this._onconnectSubChannel);
}

exports.SubChannel = SubChannel;
inherits(SubChannel, Channel);

defineDispatcher(SubChannel.prototype, "recv");

SubChannel.prototype.SocketClass = SubSocket;

SubChannel.prototype._onconnectSubChannel = function(sock) {
  var self = this;
  var subs = this._rawsubscriptions;
  var exclusions = this._exclusions;
  var keys;
  var index;
  
  keys = Object.keys(subs);
  index = keys.length;

  while (index--) {
    sock.subscribe(new Buffer(keys[index], "binary"));
  }
  
  keys = Object.keys(exclusions);
  index = keys.length;

  while (index--) {
    sock.exclude(keys[index]);
  }
}

SubChannel.prototype.exclude = function(source) {
  var sockets;
  var index;

  if (typeof source !== "string" || source.length == 0) {
    throw new Error("Expected `source` as `String`");
  }

  if (!this._exclusions[source]) {

    this._exclusions[source] = true;
    
    sockets = this._sockets;
    index = sockets.length;
    
    while (index--) {
      sockets[index].exclude(source);
    }
  }
}

SubChannel.prototype.include = function(source) {
  var sockets;
  var index;

  if (typeof source !== "string" || source.length == 0) {
    throw new Error("Expected `source` as `String`");
  }

  if (this._exclusions[source]) {

    delete this._exclusions[source];
    
    sockets = this._sockets;
    index = sockets.length;
    
    while (index--) {
      sockets[index].include(source);
    }
  }
}

/**
 *  ### Channel.subscribe(pattern)
 * 
 *  Subscribes to a specific message pattern. The pattern MUST be a string
 */
SubChannel.prototype.subscribe = function(pattern) {
  var sockets;
  var index;
  var key;

  if (Buffer.isBuffer(pattern) == false) {
    throw new Error("Expected `pattern` as `Buffer`");
  }
  
  key = pattern.toString("binary");

  if (!this._rawsubscriptions[key]) {

    this._rawsubscriptions[key] = true;
    
    sockets = this._sockets;
    index = sockets.length;
    
    while (index--) {
      sockets[index].subscribe(pattern);
    }
  }
}

/**
 *  ### Channel.unsubscribe(pattern)
 *
 *  Unsubscribes to a specific message pattern
 */
SubChannel.prototype.unsubscribe = function(pattern) {
  var sockets;
  var index;
  var key;

  if (Buffer.isBuffer(pattern) == false) {
    throw new Error("Expected `pattern` as `Buffer`");
  }
  
  key = pattern.toString("binary");

  if (this._rawsubscriptions[key]) {

    delete this._rawsubscriptions[key];
    
    sockets = this._sockets;
    index = sockets.length;
    
    while (index--) {
      sockets[index].unsubscribe(pattern);
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
SubChannel.prototype.pause = function() {
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
SubChannel.prototype.resume = function() {
  var sockets = this._sockets;
  var index = sockets.length;

  while (index--) {
    sockets[index].resume();
  }  
}
