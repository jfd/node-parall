/** 
 *        Copyright 2010 Johan Dahlberg. All rights reserved.
 *
 *  Redistribution and use in source and binary forms, with or without 
 *  modification, are permitted provided that the following conditions 
 *  are met:
 *
 *    1. Redistributions of source code must retain the above copyright notice, 
 *       this list of conditions and the following disclaimer.
 *
 *    2. Redistributions in binary form must reproduce the above copyright 
 *       notice, this list of conditions and the following disclaimer in the 
 *       documentation and/or other materials provided with the distribution.
 *
 *  THIS SOFTWARE IS PROVIDED BY HYDNA AB ``AS IS'' AND ANY EXPRESS 
 *  OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE 
 *  ARE DISCLAIMED. IN NO EVENT SHALL HYDNA AB OR CONTRIBUTORS BE LIABLE FOR 
 *  ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL 
 *  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR 
 *  SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) 
 *  HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT 
 *  LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY 
 *  OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF 
 *  SUCH DAMAGE.
 *
 */
const Buffer                = require("buffer").Buffer
    , EventEmitter          = require("events").EventEmitter
    , inherits              = require("sys").inherits
    , parseUrl              = require("url").parse
    , Stream                = require("net").Stream
    , Server                = require("net").Server
    , recvMsg               = process.binding("net").recvMsg
    , getString             = require("./encoding").getString

// Message Packet Contants
const LENGTH_OFFSET         = 0x00
    , LENGTH_SIZE           = 0x02
    , TYPE_OFFSET           = 0x02
    , TYPE_SIZE             = 0x01
    , FLAG_OFFSET           = 0x03
    , FLAG_SIZE             = 0x01
	 	, ACK_OFFSET 						= 0x04
		, ACK_SIZE 							= 0x01
    , B_HEADER_SIZE         = LENGTH_SIZE + TYPE_SIZE + FLAG_SIZE
		, R_HEADER_SIZE 				= LENGTH_SIZE + TYPE_SIZE + FLAG_SIZE + ACK_SIZE
    , B_DATA_OFFSET         = FLAG_OFFSET + FLAG_SIZE
		, R_DATA_OFFSET 				= FLAG_OFFSET + FLAG_SIZE + ACK_SIZE
    
// Message Packet Types    
const BCAST                 = 0x10
    , SUBSCRIBE             = 0x30
    , UNSUBSCRIBE           = 0x31
    , INCLUDE               = 0x32
    , EXCLUDE               = 0x33
    , REQ                   = 0x40
    , RESP_OK               = 0x41
    , RESP_REJECT           = 0x42
    , RESP_BAD              = 0x43
     
// Message Packet Flags
const REQUEST               = 0x01
    , SET_OPT               = 0x02
    , BROADCAST             = 0x04
    , REQUEST_OK            = 0x08;
	
const MAX_OUTGOING_REQUESTS = 255;

const ENCODING              = require("./encoding").ENCODING


/**
 *  Replies OK to specified message. The message is removed from the 
 *  watchlist.
 *
 *  @param {MSG_ID} msg The message to respond to. 
 */
exports.ok = function(msg) {
  var origin = msg.origin;
  var out = createAckMessage(null, RESP_OK, 0, msg.ack);
  
  if (!msg.ack) {
    throw new Error("Cannot reply to a message without ack");
  }
  
  origin.write(out);
}

/**
 *  Rejects specified message. The remote node should choose another 
 *  endpoint to handle this message. 
 *
 *  Note: The reject function should be used in load-balancing purposes
 *        only. Use reject when current node is busy and not as a way
 *        to discard unwanted messages.
 *
 *  @param {MSG_ID} msg The message to respond to. 
 */
exports.reject = function(msg) {
  var origin = msg.origin;
  var out = createAckMessage(null, RESP_REJECT, 0, msg.ack);
  
  if (!msg.ack) {
    throw new Error("Cannot reply to a message without ack");
  }
  
  origin.write(out);
}

/**
 *  Replies to specified message with a response. This function is a
 *  hybrid function. If you pass one argument(MSG_ID), this function returns
 *  a callback function. The callback function send the actual reply, with
 *  specified arguments as message body. 
 *
 *  @param {MSG_ID} msg   The message to respond to.
 *  @param {1...N}  args  The message body.
 */
exports.replyTo = function() {
  var graph = Array.prototype.slice.call(arguments);
  var msg = graph.shift();

  if (!msg.ack) {
    throw new Error("Cannot reply to a message without ack");
  }
  
  function reply() {
    var graph = Array.prototype.slice.call(arguments);
    var origin = msg.origin;
    var encode = msg.channel._encodeData;
    var payload = encode(graph);
    var out = createAckMessage(payload, RESP_OK, 0, msg.ack);
    origin.write(out);
  }
  
  return graph.length && reply.apply(null, graph) || reply;
}

/**
 *  Creates a new Channel of specified type.
 */
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
}

function implement(ctorA, ctorB) {
  for (var key in ctorB.prototype) {
    ctorA.prototype[key] = ctorB.prototype[key];
  }
}

function Channel(type) {
  this.type = type;
  this.encoding = "raw";
}

exports.Channel = Channel;
inherits(Channel, EventEmitter);

Object.defineProperty(Channel.prototype, "encoding", {
  get: function() { 
    return this._encoding;
  }, 
  set: function(value) {
    var enc = value ? value.toLowerCase() : null;
    if (ENCODING[enc]) {
      this._encoding = enc;
      this._encodeData = ENCODING[enc].encode;
      this._decodeData = ENCODING[enc].decode;
    } else {
      throw new Error("Encoding ´" + enc + "´ is not supported");
    }
  }
});


/**
 *  SenderImpl
 */
function SenderImpl() {
  this.postsPerBatch = 2048;
  this._sendQueue = [];
  this._sendQueue.size = 0;
  this._sendQueueJobRunning = false;
  this._broadcastEndpointFilter = defaultBroadcastEndpointFilter;
  this._broadcastEndpointFilterOptions = {};
}

/**
 *  Broadcasts a message to all available endpoints. The message will
 *  be discarded if no endpoints is available.
 */
SenderImpl.prototype.bcast = function() {
  var graph = Array.prototype.slice.call(arguments);
  var data = this._encodeData(graph);
  var msg = createMessage(data, BCAST, 0);
  this._sendMsg(msg);
}

SenderImpl.prototype._sendMsg = function(msg) {
  var self = this;
  var queue = this._sendQueue;

  // Discard messages if no endpoints
  if (!this._remoteEndpoints.length) {
    return;
  }
  
  queue.push(msg);
  queue.size += msg.length

  // Start send queue processing if not started.
  if (!this._sendQueueJobRunning) {
    this._startSendQueueJob();
  }    
}

/**
 *  Broadcasts a message to a specific selection of endpoints. The message
 *  whille be discarded if no endpoints is available.
 */
SenderImpl.prototype.mcast = function() {
  var graph = Array.prototype.slice.call(arguments);
  var targets = graph.shift();
  var data = this._encodeData(graph);
  var msg = createMessage(data, BCAST, -1);
  
  // Discard messages if no endpoints
  if (!targets || (Array.isArray(targets) && !targets.length) || false) {
    return;
  }
  
  msg._targets = (Array.isArray(targets) && targets) || [targets];
  
  this._sendQueue.push(msg);
  
  // Start send queue processing if not started.
  if (!this._sendQueueJobRunning) {
    this._startSendQueueJob();
  }  
  
}

SenderImpl.prototype._startSendQueueJob = function() {
  var self = this;
  var queue = this._sendQueue;
  var endpoints = this._remoteEndpoints;
  var filter = this._broadcastEndpointFilter;
  var opts = this._broadcastEndpointFilterOptions;
  var throttle = false;
  
  // Return if we send queue already is being processed 
  if (this._sendQueueJobRunning) {
    return;
  }
  
  // Discard all messages if we missing endpoints
  if (!endpoints.length) {
    this._sendQueue = [];
    this._sendQueue.size = 0;
    return;
  }
  
  this._sendQueueJobRunning = true;
  
  function run() {
    
    // if (throttle) {
    //   throttle = true;
    //   self.emit("throttleStop");
    // }

    var handle = processSendQueueJob(queue, endpoints, filter, opts);
    
    if (handle) {
      // self.emit("throttleStart");

      handle.ondrain = function() {
        // throttle = true;
      }
      process.nextTick(run);        
    } else {
      self._sendQueueJobRunning = false;
    }
  }
  
  process.nextTick(run);
}

/**
 *  RequesterImpl
 */
function RequesterImpl() {
  this._requestQueue = [];
  this._readyRemoteEndpoints = [];
  this._requestQueueJobRunning = false;
  
  this.on("endpointConnect", this.RequesterImpl_endpointConnect);
  this.on("endpointDisconnect", this.RequesterImpl_endpointDisconnect);
}

RequesterImpl.prototype.RequesterImpl_endpointConnect = function(ep) {
  
	// Extend endpoint with ACK system 
	ep.outgoingMax = MAX_OUTGOING_REQUESTS;
	ep.outgoingCount = 0;
	ep._ackWaitPool = {};

	this._readyRemoteEndpoints.push(ep);
  if (this._requestQueue.length && !this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
}

RequesterImpl.prototype.RequesterImpl_endpointDisconnect = function(ep) {
  var index = this._readyRemoteEndpoints.indexOf(ep);

  if (index !== -1) {
    this._readyRemoteEndpoints.splice(index, 1);
  }
}

/**
 *  Post a message to one of the endpoint in this channel. 
 */
RequesterImpl.prototype.send = function() {
  var graph = Array.prototype.slice.call(arguments);
  var data = this._encodeData(graph);
  var msg = createAckMessage(data, REQ, 0, 0);
  
  this._requestQueue.push(msg);
    
  // Start send queue processing if not started.
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
}

/**
 *  Sends a message to the channel and waits for an response. The message
 *  is distributed between connected  endpoints based on a round-robin 
 *  algorithm. 
 *
 *  @param {1..N}     msg       The message to send 
 *  @param {Function} callback  The callback function to call when 
 *                              response is received.
 *
 *  @example
 *
 *    channel.recv("ping", function(resp) {
 *      console.log("Got %s", resp);
 *    })
 */
RequesterImpl.prototype.recv = function() {
  var graph = Array.prototype.slice.call(arguments);
  var callback = graph.pop();
  var data = this._encodeData(graph);
  var msg = createAckMessage(data, REQ, 0, 0);
  
  if (typeof callback !== "function") {
    throw new Error("Expected callback as last argument")
  }

  msg._callback = callback;
  
  this._requestQueue.push(msg);
  
  // Start send queue processing if not started.
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }                          
}

RequesterImpl.prototype._startRequestQueueJob = function() {
  var self = this;
  var queue = this._requestQueue;
  var endpoints = this._readyRemoteEndpoints;
 	var max = this.postsPerBatch || 3;

  // Return if we send queue already is being processed or 
  // no sendqueue or no ready endpoints.
  if (this._requestQueueJobRunning || !queue.length || !endpoints.length) {
    return;
  }

  this._requestQueueJobRunning = true;

	function run() {
    processRequestQueueJob(queue, endpoints, max);
    
    // Continue to process queue if we still have messages 
    // in the request queue, else set internal variable to not 
    // running.
    if (queue.length && endpoints.length) {
      process.nextTick(run);
    } else {
      self._requestQueueJobRunning = false;
    }
  }
  
  process.nextTick(run);
}

RequesterImpl.prototype._processMessage = function(msg) {
  var origin = msg.origin;
  var endpoints = this._readyRemoteEndpoints;
  var queue = this._requestQueue;
	var waitpool = origin._ackWaitPool;
  var omsg = waitpool[msg.ack];

	// Are we currently waiting for this message? 
	if (!omsg) {
	  console.log("ack: %s", msg.ack);
		console.log("ignored message from remote %s", msg);
		return;
	}

	if (msg.psize) {
    try {
        msg.data = this._decodeData(msg, msg.hsize);
    } catch (decodeError) {
      console.log(decodeError);
      console.log(msg.toString("utf8"));
      console.log("decode error - TODO: Send back response");
      return;
    }
  }
  
  msg.channel = this;

	// Push origin back to endpoint list if not currently
	// there.
	if (origin.outgoingCount-- == origin.outgoingMax) {
		endpoints.push(origin);
	}

	// Free ack handle in origin wait pool
	waitpool[msg.ack] = undefined;
	
  switch (msg.type) {
    
   case RESP_BAD:		
      // An outgoing message was not accepted by remote endpoint because
      // of encoding. Notify user and remove message from waitqueue. Do
      // not try to resend it.
	    omsg._callback && omsg._callback("badMessage");
	    this._events && this._events["badMessage"] && this.emit("badMessage", msg);
      break;
      
    case RESP_REJECT:
      // Message was rejected by remote endpoint. The endpoint was probably
      // busy. Queue message again for a second try. But back endpoint to 
      // ready endpoints as well. 
      omsg._rejects += 1;
      queue.push(omsg);
      break;
          
    case RESP_OK:
      // Everything went ok, put endpoint back into ready 
      // endpoints. we will be using it soon again. Notify user if 
      // requested.
      if (omsg._callback) {
        omsg._callback.apply(null, (Array.isArray(msg.data) && msg.data) ||
                                   [msg.data]);
      } else {
        
        // Call ´onmessage´ if exists.
        this.onmessage && this.onmessage(msg);
        
  	    this._events && this._events["message"] 
  	                 && this.emit("message", msg);
      }
      break;

    default:
      console.log("ignoring packet with type " + msg.type);
      break;
  }

	// Start send queue process if pending pakets
  if (queue.length && !this._requestQueueJobRunning) {
  	this._startRequestQueueJob();
  }
 
}

function ResponderImpl() {
  this.on("endpointConnect", this.ResponderImpl_endpointConnect);
  this.on("endpointDisconnect", this.ResponderImpl_endpointDisconnect);
}

ResponderImpl.prototype.ResponderImpl_endpointConnect = function(ep) {
  
}

ResponderImpl.prototype.ResponderImpl_endpointDisconnect = function(ep) {
  
}

ResponderImpl.prototype._processMessage = function(msg) {
  
  if (msg.psize) {
    try {
        msg.data = this._decodeData(msg, msg.hsize);
    } catch (decodeError) {
      console.log(decodeError);
      console.log(msg.toString("utf8"));
      console.log("decode error - TODO: Send back response");
      return;
    }
  }
  
  msg.channel = this;
  
  switch (msg.type) {
    
    case REQ:
      // Message request is automaticlly timed out after X seconds.

    case BCAST:
      // Emit the ´message´ event if possible.
      this._events && this._events["message"] && this.emit("message", msg);

      // Call ´onmessage´ if exists.
      this.onmessage && this.onmessage(msg);  
      break;

    default:
      console.log("ignoring packet with type " + msg.type);
      break;
  }
}

/**
 *  SubscriberImpl
 */
function SubscriberImpl() {
  this._subscriptions = {};
  this._exclusions = [];
  this.on("endpointConnect", this._SubscriberImpl_endpointConnect);  
}

SubscriberImpl.prototype._SubscriberImpl_endpointConnect = function(ep) {
  var subs = this._subscriptions;
  var exclusions = this._exclusions;
  var keys = Object.keys(subs);
  var index = keys.length;
  var payload = null;
  var msg = null;
  
  while (index--) {
    payload = new Buffer(keys[index], "binary");
    msg = createMessage(payload, SUBSCRIBE, 0);
    ep.write(msg);
  }
  
  index = exclusions.length;

  while (index--) {
    payload = new Buffer(exclusions[index], "binary");
    msg = createMessage(payload, EXCLUDE, 0);
    ep.write(msg);
  }
}

SubscriberImpl.prototype.exclude = function(source) {
  var endpoints = null;
  var endpoint = null;
  var payload = null;
  var msg = null;
  var index = null;
  
  if (this._exclusions.indexOf(source) == -1) {
    this._exclusions.push(source);
    endpoints = this._remoteEndpoints;
    index = endpoints.length;

    // Don't bother of sending subscription update if we don't have
    // an endpoint attached.
    if (!index) {
      return;
    }

    payload = new Buffer(source, "binary");
    msg = createMessage(payload, EXCLUDE, 0);

    while (index--) {
      endpoint = endpoints[index];
      if (endpoint.writable) {
        endpoints[index].write(msg);
      }
    }
  }
}

SubscriberImpl.prototype.include = function(source) {
  var endpoints = null;
  var endpoint = null;
  var payload = null;
  var msg = null;
  var index = null;
  
  if ((index = this._exclusions.indexOf(source)) != -1) {
    this._exclusions.splice(index, 1);

    endpoints = this._remoteEndpoints;
    index = endpoints.length;

    // Don't bother of sending subscription update if we don't have
    // an endpoint attached.
    if (!index) {
      return;
    }

    payload = new Buffer(source, "binary");
    msg = createMessage(payload, INCLUDE, 0);

    while (index--) {
      endpoint = endpoints[index];
      if (endpoint.writable) {
        endpoints[index].write(msg);
      }
    }
  }
}

/**
 *  Subscribes to a specific message pattern. The pattern MUST be a string
 */
SubscriberImpl.prototype.subscribe = function(pattern) {
  var endpoints = null;
  var endpoint = null;
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
  // to endpoints. Else, just increase the counter. 
  if (!this._subscriptions[pattern]) {
    this._subscriptions[pattern] = 1;
    
    this.emit("subscribe", pattern);
    
    endpoints = this._remoteEndpoints;
    index = endpoints.length;

    // Don't bother of sending subscription update if we don't have
    // an endpoint attached.
    if (!index) {
      return;
    }

    payload = new Buffer(pattern, "binary");
    msg = createMessage(payload, SUBSCRIBE, 0);
    
    while (index--) {
      endpoint = endpoints[index];
      if (endpoint.writable) {
        endpoints[index].write(msg);
      }
    }
  } else {
    this._subscriptions[pattern] += 1;
  }
}

/**
 *  Unsubscribes to a specific message pattern
 */
SubscriberImpl.prototype.unsubscribe = function(pattern) {
  var payload = null;
  var msg = null;
  var endpoints = null;
  var endpoint = null;

  if (this.encoding !== "raw" && pattern.length) {
    throw new Error("Subscriptions patterns is only allowed on raw encoded \
                     channel");
  }
  
  // Convert to string for easier internal use.
  if (Buffer.isBuffer(pattern)) {
    pattern = pattern.toString("binary");
  }
  
  // Check if all subscription is handlers is unregistered. If so, send 
  // an UNSUBSCRIBE message to endpoints. 
  if (this._subscriptions[pattern]) {
    this._subscriptions[pattern] -= 1;
    
    if (!this._subscriptions[pattern]) {
      delete this._subscriptions[pattern];
      
      this.emit("unsubscribe", pattern);

      // Don't bother of sending subscription update if we don't have
      // an endpoint attached.
      if (!this._remoteEndpoints.length) {
        return;
      }
      
      endpoints = this._remoteEndpoints;
      index = endpoints.length;

      payload = new Buffer(pattern, "binary");
      msg = createMessage(payload, UNSUBSCRIBE, 0);

      while (index--) {
        endpoint = endpoints[index];
        if (endpoint.writable) {
          endpoints[index].write(msg);
        }
      }
    }
  }  
}

SubscriberImpl.prototype.pause = function() {
  var endpoints = this._remoteEndpoints;
  var index = endpoints.length;

  while (index--) {
    endpoints[index].pause();
  }  
}

SubscriberImpl.prototype.resume = function() {
  var endpoints = this._remoteEndpoints;
  var index = endpoints.length;

  while (index--) {
    endpoints[index].resume();
  }  
}

SubscriberImpl.prototype._processMessage = function(msg) {
  
  if (msg.psize) {
    try {
        msg.data = this._decodeData(msg, msg.hsize);
    } catch (decodeError) {
      console.log(decodeError);
      console.log(msg.toString("utf8"));
      console.log("decode error - TODO: Send back response");
      return;
    }
  }
  
  switch (msg.type) {
    
    case BCAST:
      // Emit the ´message´ event if possible.
      this._events && this._events["message"] && this.emit("message", msg);

      // Call ´onmessage´ if exists.
      this.onmessage && this.onmessage(msg);  
      break;

    default:
      console.log("ignoring packet with type " + msg.type);
      break;
  }
}


function PublisherImpl() {  
  this._subscriptions = {};
  this._pipedChannels = [];
  this._hasPatternLengthVariants = -1;
  this._broadcastEndpointFilter = patternBasedEndpointFilter;
  this._broadcastEndpointFilterOptions = { longestKey: 0 };
  this.on("endpointDisconnect", this._PublisherImpl_endpointDisconnect);
}

PublisherImpl.prototype._PublisherImpl_endpointDisconnect = function(ep) {
  var opts = this._broadcastEndpointFilterOptions;
  var subs = ep._subscriptions;
  var index = subs ? subs.length : 0;
  var sub = null;
  var longest = 0;

  while (index--) {
    sub = subs[index];
    longest = sub.length > longest ? sub.length: longest;
    this._removeSubscription(ep, sub);
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

  if (!channel || channel.type !== "sub") {
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
  channel.on("message", this._sendMsg.bind(this));
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


PublisherImpl.prototype._processMessage = function(msg) {
  var pattern = getString(this.encoding, msg.hsize, msg);
  var origin = msg.origin;
  var index;
  var exclusions;
  var subs;
  var index;

  switch (msg.type) {
    
    case INCLUDE:
      exclusions = origin._exclusions;
    
      if (exclusions && (index = exclusions.indexOf(pattern)) != -1) {
        exclusions.splice(index, 1);
      }
      break;
      
    case EXCLUDE:
      exclusions = origin._exclusions;
      
      if (!exclusions) {
        exclusions = origin._exclusions = [pattern];
      } else if (exclusions.indexOf(pattern) == -1) {
        exclusions.push(pattern);
      }
      break;
    
    case SUBSCRIBE:
      subs = origin._subscriptions;

      if (!subs) {
        subs = origin._subscriptions = [pattern];
        
        if (pattern.length == 0) {
          origin._nullSubscriptions = true;
        }
        
        this._addSubscription(origin, pattern);
      } else if (subs.indexOf(pattern) == -1) {
        
        if (pattern.length == 0) {
          origin._nullSubscriptions = true;
        }
        
        subs.push(pattern);
        this._addSubscription(origin, pattern);
      }
      
      break;
      
    case UNSUBSCRIBE:
      subs = origin._subscriptions;

      if (!subs || (index = subs.indexOf(pattern)) == -1) {
        return;
      }
      
      if (pattern.length == 0) {
        origin._nullSubscriptions = false;
      }
      
      subs.splice(index, 1);
    
      this._removeSubscription(origin, pattern);      
      break;

    default:
      console.log("PublisherImpl: ignoring packet with type " + msg.type);
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

PublisherImpl.prototype._addSubscription = function(ep, pattern) {
  var subs = this._subscriptions[pattern];
  var opts = this._broadcastEndpointFilterOptions;
  var patternl = pattern.length;
  var longest = opts.longestKey;
  var hasVariants = this._hasPatternLengthVariants;
  var pipedChannels = this._pipedChannels;
  var index;
  
  if (!subs) {
    subs = this._subscriptions[pattern] = [ep];
    
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
    
    // Do not add same endpoint to list twice.
    if (subs.indexOf(ep) == -1) {
      subs.push(ep);
    }
  }
}

PublisherImpl.prototype._removeSubscription = function(ep, pattern) {
  var subs = this._subscriptions[pattern];
  var index = subs ? subs.indexOf(ep) : -1;
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

/**
 *  Creates a new ServerChannel. This Class should inherited.
 */
function ServerChannel(type) {
  Channel.call(this, type);
 
  this._delegateTo = null;
  this._delegateToMsg = [];
  this._remoteEndpoints = [];
  this._bindEndpoints = {};
}

exports.ServerChannel = ServerChannel;
inherits(ServerChannel, Channel);

/**
 *  Bind an address to this channel.
 *
 *  @param {String}   epUrl     Url to bind.
 *  @param {Function} callback  An optional callback on error or
 *                              or connect.
 */
ServerChannel.prototype.bind = function(epUrl, callback) {
  var self = this;
  var serverep;
  var url = parseUrl(epUrl);
  var host = url.hostname == "*" ? undefined : url.hostname;
  var port = parseInt(url.port);
  
  if (this._bindEndpoints[url.href]) {
    throw new Error("Channel is already attached to endpoint.");
  }
  
  function onconnect() {
    serverep.removeListener("error", onerror);
    callback && callback(null, epUrl);
  }
  
  function onerror(error) {
    serverep.removeListener("error", onerror);
    callback && callback(error);
  }

  serverep = new Server();
  serverep._endpointUrl = url;

  try {
    switch (url.protocol) {
      case "tcp:":
        serverep.endpointType = "tcp/responder";
        serverep.listen(port, host, onconnect);
        break;

      case "sock:":
        serverep.endpointType = "sock/responder";
        serverep.listen(host, onconnect);
        break;

      case "proc:":
        serverep.endpointType = "proc/responder";
        serverep.listen(createProcSockAlias(host), onconnect);
        break;
    }
  } catch (err) {
    onerror(err);
  }
  
  serverep.on("connection", function(ep) {
    
    // Check if channel is in delegate-to mode. If so, ignore to
    // initialize stream. 
    if (self._delegateTo) {
      ep.pause();
      self._delegateTo.sendFD(ep.fd, 
                      ["delegate-" + self.type].concat(self._delegateToMsg));
      return;
    }
    
    self._attachEndpoint(ep);
  });
  
  serverep.on("error", onerror);
  
  serverep.on("close", function() {
    delete self._bindEndpoints[url.href];
  });
  
  this._bindEndpoints[url.href] = serverep;
}

/**
 *  Delegates all incomming connections to another server channel. This 
 *  is useful when working with workers (load-balancing).
 *
 *  @param {ServerChannel} channel The server channel instance that should
 *                                 receive the new connections.
 *  @param {...}           args    A set of extra arguments that should
 *                                 be sent with the delegate-to message.
 */
ServerChannel.prototype.delegateTo = function() {
  var graph = Array.prototype.slice.call(arguments);
  var channel = graph.shift();
  
  if (!channel || !channel.sendFD) {
    throw new Error("Excepted server channel");
  }

  this._delegateTo = channel;
  this._delegateToMsg = graph.length ? graph : [];
}

/**
 *  Attach a FD to this server channel
 */
ServerChannel.prototype.attach = function(fd) {
  var stream = new Stream(fd);
  this._attachEndpoint(stream);
  stream.resume();
}

/**
 *  Internal. Attach an endpoint to this ServerChannel instance.
 */
ServerChannel.prototype._attachEndpoint = function(ep) {
  var self = this;
  
  // Initialize message parsing for the stream.
  initStream(ep);

  ep._processMessage = self._processMessage.bind(self);
  
  self._remoteEndpoints.push(ep);
  self.emit("endpointConnect", ep);
  
  ep.on("error", function(err) { console.log(err); this.destroy() });

  ep.on("end", function() {
    this.destroy();
  });
  
  ep.on("close", function() {
    var index = self._remoteEndpoints.indexOf(this);

    if (index !== -1) {
      self._remoteEndpoints.splice(index, 1);
    }

    self.emit("endpointDisconnect", this);      
  });  
}

/**
 *  Base class for Client Channels
 */
function ClientChannel(type) {
  Channel.call(this, type);
  
  this.autoReconnect = true;
  this._remoteEndpoints = [];
  this._disconnectedEndpoints = [];
}

exports.ClientChannel = ClientChannel;
inherits(ClientChannel, Channel);

ClientChannel.prototype.connect = function(endpointUrl, options) {
  var opts = Object.create(options || {});
  var self = this;
  var ep = null;
  var url = parseUrl(endpointUrl);
  
  // We do not want duplicates connection to same endpoint. 
  if (this._remoteEndpoints[url.href]) {
    return this._remoteEndpoints[url.href];
  }
  
  if (url.protocol == "fd:") {
    ep = new Stream(parseInt(url.hostname));
  } else {
    ep = new Stream();
  }
  
  switch (url.protocol) {
    case "tcp:":
      ep.endpointType = "tcp/connection";
      ep.connect(url.port, url.hostname);
      break;
      
    case "sock:":
      ep.endpointType = "sock/connection";
      ep.connect(url.hostname);
      break;

    case "proc:":
      ep.endpointType = "proc/connection";
      ep.connect(createProcSockAlias(url.hostname));
      break;
      
    case "fd":
      ep.endpointType = "fd/connection";
      break;
  }
  
  ep.on("connect", function() {
    var request = null;
    var payload = null;
    
    // console.log("Connected to remote endpoint...");
    initStream(this);

    ep._originType = opts.originType || null;
    ep._processMessage = self._processMessage.bind(self);

    self._remoteEndpoints.push(ep);
    self.emit("endpointConnect", ep);
    
    ep.on("error", function() { this.destroy() });
    
    ep.on("end", function() {
      this.destroy();
    });

    ep.on("close", function() {
      var index = self._remoteEndpoints.indexOf(this);

      if (index !== -1) {
        self._remoteEndpoints.splice(index, 1);
      }

      if (self.autoReconnect) {
        this._disconnectedAt = new Date();
        self._disconnectedEndpoints.push(this);
      }

      self.emit("endpointDisconnect", this);
    });
  });
  
  return ep;
}

/**
 *  Initializes a new RequestChannel instance.
 */
function RequestChannel() {
  ClientChannel.call(this, "req");
  RequesterImpl.call(this);
  SenderImpl.call(this);
}

exports.RequestChannel = RequestChannel;
inherits(RequestChannel, ClientChannel);
implement(RequestChannel, RequesterImpl);
implement(RequestChannel, SenderImpl);

/**
 *  Initializes a new ResponderChannel instance.
 */
function ResponseChannel() {
  ServerChannel.call(this, "resp");
  ResponderImpl.call(this);
}

exports.ResponseChannel = ResponseChannel;
inherits(ResponseChannel, ServerChannel);
implement(ResponseChannel, ResponderImpl);


/**
 *  Initializes a new MasterChannel instance.
 */
function MasterChannel() {
  ServerChannel.call(this, "master");
  SenderImpl.call(this);
  RequesterImpl.call(this);
  this._initial = null;
}

exports.MasterChannel = MasterChannel;
inherits(MasterChannel, ServerChannel);
implement(MasterChannel, SenderImpl);
implement(MasterChannel, RequesterImpl);

MasterChannel.prototype._MasterChannel_endpointConnect = function(ep) {
  this.mcast.apply(this, [ep].concat(this._initial));
}

/**
 *  Set outgoing message for newly connected endpoints (workers). Disable
 *  by setting ´null´.
 */
Object.defineProperty(MasterChannel.prototype, "initial", {
  get: function() { 
    return this._initial;
  }, 
  set: function(value) {
    if (value) {
      this.bcast(value);
      
      if (!this._initial) {
        this.on("endpointConnect", this._MasterChannel_endpointConnect);
      }
      
    } else {
      this.removeListener("endpointConnect", 
                          this._MasterChannel_endpointConnect);
    }
    this._initial = value;
  }
});

MasterChannel.prototype.sendFD = function(fd, graph, callback) {
  var data = this._encodeData(graph);
  var msg = createAckMessage(data, REQ, 0, 0);
  
  msg._fd = fd;
  msg._callback = callback;

  this._requestQueue.push(msg);

  // Start request send queue processing if not started.
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
}



/**
 *  Initializes a new WorkerChannel instance.
 */
function WorkerChannel() {
  ClientChannel.call(this, "worker");
  ResponderImpl.call(this);
}

exports.WorkerChannel = WorkerChannel;
inherits(WorkerChannel, ClientChannel);
implement(WorkerChannel, ResponderImpl);


/**
 *  Initializes a new PublisherChannel instance.
 */
function PublisherChannel() {
  ServerChannel.call(this, "pub");
  SenderImpl.call(this);
  PublisherImpl.call(this);
}

exports.PublisherChannel = PublisherChannel;
inherits(PublisherChannel, ServerChannel);
implement(PublisherChannel, SenderImpl);
implement(PublisherChannel, PublisherImpl);


/**
 *  Creates a new Subscriber Channel instance
 */
function SubscriberChannel() {
  ClientChannel.call(this, "sub");
  SubscriberImpl.call(this);
}

exports.SubscriberChannel = SubscriberChannel;
inherits(SubscriberChannel, ClientChannel);
implement(SubscriberChannel, SubscriberImpl);

/**
 *  Internal class.
 */
function DrainWaitHandle() {
  EventEmitter.call(this);
  this.ondrain = null;
  this._count = 0;
  this._emitted = false;
}

DrainWaitHandle.prototype.push = function(ep) {
  var self = this;

  function free() {
    ep.removeListener("close", free);
    ep.ondrain = null;
    if (!(--self._count)) {
      self.ondrain && self.ondrain();
    }
  }

  ep.ondrain = free;
  ep.on("close", free);
  
  this._count++;
}


/**
 *  Creates a new Messaging Channel from specified stream.
 */
function initStream(self) {
  var sizeBuffer = new Buffer(LENGTH_SIZE);
  var cbuffer = sizeBuffer;
  var cpos = 0;
  var pendingFD = undefined;
  
  if (self.type == "unix") {
    self._readImpl = function(buf, off, len, calledByIOWatcher) {
      var bytesRead = recvMsg(self.fd, buf, off, len);

      if (recvMsg.fd !== null) {
        pendingFD = recvMsg.fd;
      }

      return bytesRead;
    };
  }
  
  // Override nodes implementation of readWatcher.callback
  self._readWatcher.callback = function() {
    var tmpbuffer;
    var bytesRead;
    var msg;

    try {
      bytesRead = self._readImpl(cbuffer, cpos, cbuffer.length - cpos, 
                                 (arguments.length > 0));
    } catch (e) {
      self.destroy(e);
      return;
    }

    if (bytesRead === 0) {
      self.readable = false;
      self._readWatcher.stop();

      if (!self.writable) self.destroy();
      // Note: 'close' not emitted until nextTick.

      if (self._events && self._events['end']) self.emit('end');
      if (self.onend) self.onend();
      return;
    } 
    
    cpos += bytesRead;
    
    // We got the size of the message. We can now allocate a new message
    // buffer and start receive to that instead. Else wait for the actual 
    // message size. wait for morebytes...
    // 
    // Else, wait for all bytes in message to be read. Then notify channel
    // that a new message is waiting.
    if (cpos == LENGTH_SIZE) {
      tmpbuffer = new Buffer((cbuffer[0] * 256) + cbuffer[1]);
      tmpbuffer[0] = cbuffer[0];
      tmpbuffer[1] = cbuffer[1];
      cbuffer = tmpbuffer;
    } else if (cpos === cbuffer.length) {

      // Get a message data struct from the message buffer.
      msg = createMessageFromBuffer(cbuffer);

      msg.fd = pendingFD;
      msg.origin = self;

      pendingFD = undefined;

      if (pendingFD) {
        // Save off recvMsg.fd in a closure so that, when we emit it later, we're
        // emitting the same value that we see now. Otherwise, we can end up
        // calling emit() after recvMsg() has been called again and end up
        // emitting null (or another FD).
        process.nextTick(function() {
          self._processMessage(msg);
        });
        pendingFD = undefined;
      } else {
        self._processMessage(msg);
      }
      
      // Restart the process by settings bufferPos and msgBuffer 
      // to null.
      cpos = 0;
      cbuffer = sizeBuffer;
    }

  }

  self.on("error", function() { this.destroy() });
}

/**
 * Process specified request queue.
 */
function processRequestQueueJob(queue, endpoints, max) {
	var size = queue.length;
  var count = max;
  var endpoint = null;
  var index = null;
  var msg = null;
	var ack = null;
	var waitpool = null;

  while (count-- && queue.length && endpoints.length) {
    msg = queue.shift();
    endpoint = endpoints.shift();

    if (!endpoint.writable && !endpoint.fd) {
      // Error sending packet. Put msg pack into the queue. Give it some 
      // priority by putting it to the beginning. 
			queue.unshift(msg);
      continue;
    }

		waitpool = endpoint._ackWaitPool;
		ack = endpoint.outgoingMax + 1;

		// Find free ack no for this msg
    while (ack-- && waitpool[ack]) { }

		// Couldn't find a free handle for message. Enqueue 
		// again and wait for a ready endpoint.
		// 
		// Note: This should never happen, because we remove the
		//       endpoint from readyRemoteEndpoints.
		if (!ack) {
			queue.unshift(msg);
			continue;
		}

		// Set message ack to the one generated.
		msg[ACK_OFFSET] = ack;

    if (msg._fd) {
     
			// Put msg back in queue if we are dealing with an
			// endpoint that doesn't support unix FD.
      if (!endpoint.type == "unix") {
        queue.unshift(msg);
				endpoints.push(endpoint);
        continue;
      }
      
      endpoint.write(msg, null, msg._fd);
      
    } else {
      endpoint.write(msg);
    }

    msg._rejects = msg._rejects ? msg._rejects + 1 : 0;
    msg._sent = new Date();

		waitpool[ack] = msg;
    
		// Put endpoint back in ready endpoints queue if still
		// have acks left.
		if (++endpoint.outgoingCount < endpoint.outgoingMax) {
			endpoints.push(endpoint);
		}
  }
	
	// Return no of sent messages.
	return size - queue.length;
}

function processSendQueueJob(queue, endpoints, filter, filterOpts) {
  var size = queue.length;
  var endpoint = null;
  var sendlist = null;
  var index = null;
  var msg = null;
  var dest = null;
  var drainWaitHandle = null;

  while (!drainWaitHandle && (msg = queue.shift())) {

    sendlist = filter(msg._targets || endpoints, msg, filterOpts);
    index = sendlist.length;
    
    while (index--) {
      endpoint = sendlist[index];
      if (!endpoint.write(msg)) {
        
        if (!drainWaitHandle) {
          drainWaitHandle = new DrainWaitHandle();
        }
        
        drainWaitHandle.push(endpoint);
      }
    }
    
    queue.size -= msg.length;
  }
  
  // Return no of sent messages.
  return drainWaitHandle;
}

/**
 *  Returns a list with all endpoints that should 
 *  receive specified message.
 */
function defaultBroadcastEndpointFilter(endpoints, msg, opts) {
  var index = endpoints.length;
  var endpoint = null;
  var result = [];

  while (index--) {
    endpoint = endpoints[index];
    if (endpoint.writable && endpoint.fd) {
      result.push(endpoint);
    }
  }
  
  return result;
}

/**
 *  Returns a list of endpoints that has a matching pattern 
 *  for the specified msg
 */
function patternBasedEndpointFilter(endpoints, msg, opts) {
  var longest = Math.min(opts.longestKey, msg.length - B_DATA_OFFSET);
  var pattern = msg.toString("binary", B_DATA_OFFSET, B_DATA_OFFSET + longest);
  var origin = msg.origin;
  var index = endpoints.length;
  var patternIndex = null;
  var endpoint = null;
  var subs = null;
  var result = [];

  while (index--) {
    endpoint = endpoints[index];
    
    // Check if endpoint is writable.
    if (endpoint.writable && endpoint.fd) {
      if (endpoint._exclusions && endpoint._exclusions.length && 
          origin && origin._originType &&
          endpoint._exclusions.indexOf(origin._originType) != -1) {
        continue;
      }
      
      // Add endpoint to result list if he subscribes to 
      // ALL messages, else try to filter against 
      // endpoint subscriptions.
      if (endpoint._nullSubscriptions) {
        result.push(endpoint);
      } else {
        subs = endpoint._subscriptions;
        patternIndex = (subs && subs.length) || 0;

        while (patternIndex--) {
          if (pattern == subs[patternIndex].substr(0, pattern.length)) {
            result.push(endpoint);
            break;
          }
        }
      }
    }
  }

  return result;
}

function createMessage(payload, type, flag) {
  var plength = payload ? payload.length : 0;
  var length = plength + B_HEADER_SIZE;
  var msg = new Buffer(length);
  
  msg[LENGTH_OFFSET    ] = Math.floor(length / 256) & 0xff;
  msg[LENGTH_OFFSET + 1] = length % 256;
  msg[TYPE_OFFSET      ] = type;
  msg[FLAG_OFFSET      ] = flag;
  
  payload && payload.copy(msg, B_DATA_OFFSET, 0, payload.length);

  msg.msgtype = type;  

  return msg;
}

function createAckMessage(payload, type, flag, ack) {
  var plength = payload ? payload.length : 0;
  var length = plength + R_HEADER_SIZE;
  var msg = new Buffer(length);
  
  msg[LENGTH_OFFSET    ] = Math.floor(length / 256) & 0xff;
  msg[LENGTH_OFFSET + 1] = length % 256;
  msg[TYPE_OFFSET      ] = type;
  msg[FLAG_OFFSET      ] = flag;
	msg[ACK_OFFSET       ] = ack;
  
  payload && payload.copy(msg, R_DATA_OFFSET, 0, payload.length);

  msg.msgtype = type;  

  return msg;
}

/**
 *  Creates a new message from a buffer.
 */
function createMessageFromBuffer(buffer) {
  var type = buffer[TYPE_OFFSET];
  var flag = buffer[FLAG_OFFSET];
	var ack = ((type >= REQ) && buffer[ACK_OFFSET]) || 0;

	buffer.type = type;
	buffer.flag = flag;
	buffer.ack = ack;
	buffer.hsize = (ack && R_DATA_OFFSET) || B_DATA_OFFSET;
	buffer.psize = buffer.length - ((ack && R_DATA_OFFSET) || B_DATA_OFFSET);

  return buffer;
}

function createProcSockAlias(alias) {
  var pid = process.__parallMainProcessPID ? process.__parallMainProcessPID :
                                             process.pid;

  return ["/tmp/parall-", pid, "-", alias, ".sock"].join("");
}