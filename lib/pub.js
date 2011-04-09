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

var inherits              = require("util").inherits
  , equal                 = require("assert").equal
  , notEqual              = require("assert").notEqual;

var Socket                = require("./socket").Socket
  , Channel               = require("./channel").Channel
  , createMessage         = require("./message").createMessage;

var PAYLOAD_OFFSET        = require("./message").PAYLOAD_OFFSET;

var findEventListener     = require("./util").findEventListener;

// Option Types
var SUBSCRIBE             = 0x01
  , UNSUBSCRIBE           = 0x02
  , INCLUDE               = 0x03
  , EXCLUDE               = 0x04;


function sendImpl(buffer) {
  var msg;

  if (buffer instanceof Buffer) {
    msg = createMessage(buffer, 0 ,0);
  } else {
    // Pub doesnt support complex messages for now.
    throw new Error("Pub socket and channel doesnt support complex messages.");
  }

  return this._sendmsg(msg, false);
}


function PubSocket(options) {
  var opts = options || {};
  Socket.call(this, opts);

  this._rawsubscriptions = null;
  this._rawpatternvariants = null;
  this._rawpatternlongest = -1;
  this._exclusions = null;
  this._nullsubscriptions = false;
}

exports.PubSocket = PubSocket;
inherits(PubSocket, Socket);

PubSocket.prototype._processMessage = function(msg) {
  var events = this._events;
  var index;
  var exclusions;
  var pattern;
  var subs;
  var length;

  switch (msg.option) {

    case INCLUDE:

      exclusions = this._exclusions;
      pattern = msg.graph.toString("ascii");

      if (exclusions && exclusions[pattern]) {
        delete exclusions[pattern];

        if (Object.keys(exclusions) === 0) {
          this._exclusions = null;
        }
      }

      break;

    case EXCLUDE:

      exclusions = this._exclusions;
      pattern = msg.graph.toString("ascii");

      if (!exclusions) {
        exclusions = this._exclusions = {};
        exclusions[pattern] = true;
      } else {
        exclusions[pattern] = true;
      }

      break;

    case SUBSCRIBE:

      if (msg.complex) {
        // Complex patterns is currently disabled

        this.destroy(new Error("Complex subscription's is currently disabled"));
      } else {

        subs = this._rawsubscriptions;
        pattern = msg.graph.toString("binary");

        if (!subs) {
          subs = this._rawsubscriptions = [pattern];
        } else if (subs.indexOf(pattern) == -1) {
          subs.push(pattern);
        } else {
          // Socket is already listen for this pattern,
          // ignore the request.

          return;
        }

        length = pattern.length;

        if (length === 0) {
          // Length zero indicates that socket want to subscribe to
          // all possible messages.

          this._nullsubscriptions = true;

          if (this._rawpatternlongest !== length) {
            this._rawpatternvariants = true;
          }

        } else if (length > this._rawpatternlongest) {
          // Check if this subscription is the longest one. If
          // so, check if we have variable pattern lenghts. This
          // is an optimization that let us skip recalcLongestKey
          // when remvoing subscriptions.

          if (this._rawpatternvariants === null) {
            // Initialize the `rawpatternvariants` variable

            this._rawpatternvariants = false;
          } else if (!this._rawpatternvariants &&
                     length != this._rawpatternlongest){

            this._rawpatternvariants = true;
          }
        }

        if (length > this._rawpatternlongest) {
          // This pattern is the longest.

          this._rawpatternlongest = length;
        }


        events && events.subscribe && this.emit("subscribe", pattern);
      }


      break;

    case UNSUBSCRIBE:

      if (msg.complex) {
        // Complex patterns is currently disabled

        this.destroy(new Error("Complex subscription's is currently disabled"));
      } else {

        subs = this._rawsubscriptions;
        pattern = msg.graph.toString("binary");

        if (!subs || (index = subs.indexOf(pattern)) == -1) {
          return;
        }

        subs.splice(index, 1);

        length = pattern.length;

        if (length == this._rawpatternlongest &&
            this._rawpatternvariants) {
          // Need to recalculate the longest pattern again

          index = subs.length;

          this._rawpatternvariants = false;
          this._rawpatternlongest = -1;

          while (index--) {
            length = subs[index].length;
            if (length > this._rawpatternlongest) {
              if (this._rawpatternlongest !== -1) {
                this._rawpatternlongest = true;
              }
              this._rawpatternlongest = length;
            } else if (length < this._rawpatternlongest) {
              this._rawpatternvariants = true;
            }
          }
        }

        if (length === 0) {
          this._nullsubscriptions = false;
        }

        events && events.unsubscribe && this.emit("unsubscribe", pattern);

      }


      break;

    default:
      // Ignore all message's that isn't flag with OPTION.
      // PubSocket's cannot receive messages.

      break;
  }
};

PubSocket.prototype.send = sendImpl;

// Initializes a new PubChannel instance.
function PubChannel() {
  Channel.call(this, "pub");

  this._sendqueue = [];
  this._sendqueue.size = 0;
  this._sendqueue.running = false;
  this._rawsubscriptions = {};
  this._pipedChannels = [];
  this.on("connect", this._onconnectPubChannel);
  this.on("disconnect", this._ondisconnectPubChannel);
}

exports.PubChannel = PubChannel;
inherits(PubChannel, Channel);

PubChannel.prototype.SocketClass = PubSocket;

PubChannel.prototype._onconnectPubChannel = function(sock) {
  var rawsubscriptions = this._rawsubscriptions;
  var pipedchannels = this._pipedChannels;
  var self = this;
  var index;

  function onsubscribe(pattern) {
    var sockets = rawsubscriptions[pattern];
    var index;

    if (!sockets) {
      sockets = rawsubscriptions[pattern] = [sock];

      // Update subscrptions model for piped channels
      if ((index = pipedchannels.length)) {
        while (index--) {
          pipedchannels[index].subscribe(pattern);
        }
      }

      self.emit("subscribe", pattern);
    } else {

      // Do not add same socket to list twice.
      equal(sockets.indexOf(sock), -1);

      sockets.push(sock);
    }

  }

  function onunsubscribe(pattern) {
    var sockets;
    var index;

    sockets = rawsubscriptions[pattern];
    notEqual(sockets, undefined);

    index = sockets.indexOf(sock);
    notEqual(index, -1);

    sockets.splice(index, 1);

    if (sockets.length === 0) {
      // Delete subscriptions for pattern IF this was the
      // last subscription and update subscrptions model
      // for piped channels.

      delete rawsubscriptions[pattern];

      if ((index = pipedchannels.length)) {
        while (index--) {
          pipedchannels[index].unsubscribe(pattern);
        }
      }

      self.emit("unsubscribe", pattern);
    }

  }

  onsubscribe.owner = this;
  onunsubscribe.owner = this;

  if (sock._subscriptions && sock._rawsubscriptions.length) {
    // Process sockets current subscriptions, if exists.

    for (var i = 0, l = sock._rawsubscriptions.length; i < l; i++) {
      onsubscribe(sock._rawsubscriptions[i]);
    }

  }

  sock.on("subscribe", onsubscribe);
  sock.on("unsubscribe", onunsubscribe);
  sock.on("error", function() {});
};

PubChannel.prototype._ondisconnectPubChannel = function(sock) {
  var onsubscribe;
  var onunsubscribe;
  var index;
  var all;

  // Find our subscribe handler
  onsubscribe = findEventListener(sock, "subscribe", this);
  notEqual(onsubscribe, undefined);
  sock.removeListener("subscribe", onsubscribe);

  // Find our unsubscribe handler
  onunsubscribe = findEventListener(sock, "unsubscribe", this);
  notEqual(onunsubscribe, undefined);
  sock.removeListener("unsubscribe", onunsubscribe);

};

PubChannel.prototype._PublisherImpl_throttleStart = function() {
  var channels = this._pipedChannels;
  var index = channels.length;
  while (index--) {
    channels[index].pause();
  }
};

PubChannel.prototype._PublisherImpl_throttleStop = function() {
  var channels = this._pipedChannels;
  var index = channels.length;
  while (index--) {
    channels[index].resume();
  }
};

PubChannel.prototype.send = sendImpl;

PubChannel.prototype._sendmsg = function(msg) {
  var queue;

  // Discard messages if no sockets
  if (!this._sockets.length) {
    return;
  }

  queue = this._sendqueue;
  queue.push(msg);
  queue.size += msg.length;

  // Start send queue processing if not started.
  if (!queue.running) {
    this._startSendQueueJob();
  }
};

PubChannel.prototype._startSendQueueJob = function() {
  var self = this;
  var queue = this._sendqueue;
  var sockets = this._sockets;
  var filter = this._broadcastEndpointFilter;
  var opts = this._broadcastEndpointFilterOptions;
  var throttle = false;

  // Return if we send queue already is being processed
  if (queue.running) {
    return;
  }

  // Discard all messages if we missing sockets
  if (!sockets.length) {
    this._sendqueue = [];
    this._sendqueue.size = 0;
    this._sendqueue.running = false;
    return;
  }

  queue.running = true;

  function run() {
    var handle;

    if (throttle) {
      throttle = false;
      self.emit("throttleStop");
    }

    handle = processSendQueueJob(queue, sockets);

    if (handle) {
      self.emit("throttleStart");

      handle.ondrain = function() {
        throttle = true;
        process.nextTick(run);
      };

    } else {
      queue.running = false;
    }
  }

  process.nextTick(run);
};

/**
 *  Pipes a subscriber message to this publisher. All messages is forwards
 *  that is received on this channel.
 *
 *  @param {Channel} channel The subscriber channel instance to receive from.
 */
PubChannel.prototype.pipe = function(channel) {
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

  if (channels.length === 0) {
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

    if (channels.length === 0) {
      self.removeListener("throttleStart", this._PublisherImpl_throttleStart);
      self.removeListener("throttleStop", this._PublisherImpl_throttleStop);
    }
  });

  while (index--) {
    channel.subscribe(keys[index]);
  }

  channels.push(channel);
};

function processSendQueueJob(queue, sockets) {
  var drainWaitHandle;
  var filtered;
  var sock;
  var index;
  var msg;

  while (!drainWaitHandle && (msg = queue.shift())) {

    filtered = rawPatternFilter(sockets, msg);
    index = filtered.length;

    while (index--) {
      sock = filtered[index];

      if (sock._writemsg(msg) === false) {
        // The message was not completely written. Create a
        // drain-wait handle and wait for the socket to flush.

        if (!drainWaitHandle) {
          drainWaitHandle = new DrainWaitHandle();
        }

        drainWaitHandle.push(sock);
      }
    }

    queue.size -= msg.length;
  }

  // Return no of sent messages.
  return drainWaitHandle;
}

// Returns a list of sockets that has a
// matching pattern for the specified msg.
function rawPatternFilter(sockets, msg) {
  var origin = msg.origin;
  var index = sockets.length;
  var result = [];
  var pattern;
  var longest;
  var patternindex;
  var sock;
  var subs;
  var max;

  while (index--) {
    sock = sockets[index];

    if (!sock.fd || !sock.writable) {
      // Ignore invalid sockets.

      continue;
    }

    if (sock._exclusions && origin && sock._exclusions[origin.id]) {
      // Ignore socket if it matches exclusion.

      continue;
    }

    if (sock._nullsubscriptions) {
      // Add socket to result list if he subscribes to
      // ALL messages

      result.push(sock);
      continue;

    } else {
      // try to filter against socket subscriptions.

      subs = sock._rawsubscriptions;

      if (!subs || subs.length === 0) {
        // Ignore socket if no subscriptions.

        continue;
      }

      if (!pattern || sock._rawpatternlongest > pattern.length) {
        // Slice message for pattern if not defined. Re-slice
        // pattern if socket has a longer pattern in list.

        longest = Math.min(sock._rawpatternlongest,
                           msg.length - PAYLOAD_OFFSET);

        pattern = msg.toString("binary", PAYLOAD_OFFSET,
                                         PAYLOAD_OFFSET + longest);
      }

      patternindex = subs.length;

      while (patternindex--) {
        sockpattern = subs[patternindex];
        max = sockpattern.length;

        if (sockpattern.length == pattern.length &&
            sockpattern == pattern) {
          result.push(sock);
        } else if (sockpattern.length > pattern.length &&
                   sockpattern.substr(0, pattern.length) == pattern) {
          result.push(sock);
        } else if (pattern.substr(0, sockpattern.length) == sockpattern){
          result.push(sock);
        }
      }
    }
  }

  return result;
}

// Internal class.
function DrainWaitHandle() {
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
};