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
 *  THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, 
 *  INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY 
 *  AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL 
 *  THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, 
 *  SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED 
 *  TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR 
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF 
 *  LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING 
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, 
 *  EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */
const Buffer                = require("buffer").Buffer
    , EventEmitter          = require("events").EventEmitter
    , inherits              = require("util").inherits
    , parseUrl              = require("url").parse
    , Stream                = require("net").Stream
    , Server                = require("net").Server
    , recvMsg               = process.binding("net").recvMsg
    , notEqual              = require("assert").notEqual
    , createDynamic         = require("./chaining").createDynamic
    , isDynamic             = require("./chaining").isDynamic
    , parseDynamics         = require("./chaining").parseDynamics
    , Matcher               = require("./matching").Matcher
    , getString             = require("./encoding").getString
    , encode                = require("./encoding").encode
    , decode                = require("./encoding").decode
    
// Message Contants
const LENGTH_OFFSET         = 0x00
    , LENGTH_SIZE           = 0x02
    , FLAG_OFFSET           = 0x02
    , FLAG_SIZE             = 0x01
    , ACK_OFFSET            = 0x03
    , ACK_SIZE              = 0x01
    , HEADER_SIZE           = LENGTH_SIZE + FLAG_SIZE + ACK_SIZE
    , PAYLOAD_OFFSET        = FLAG_OFFSET + FLAG_SIZE + ACK_SIZE
    , PAYLOAD_MAX           = 0xFFFF - HEADER_SIZE
    , OPTIONVAL_OFFSET      = PAYLOAD_OFFSET + 1
    
// Message Flags
const OPTION                = 0x01
    , REJECT                = 0x02
    , MULTIPART             = 0x04
    , MULTIPART_LAST        = 0x08;

// Option Types
const SUBSCRIBE             = 0x01
    , UNSUBSCRIBE           = 0x02
    , INCLUDE               = 0x03
    , EXCLUDE               = 0x04
    
const MAX_OUTGOING_REQUESTS = 255;

// Client Reconnect Constants
const MAX_RECONNECT_SLOTS   = 5
    , ATTEMPTS_PER_SLOT     = 5
    , RECONNECT_INTERVAL    = 200;
    
const SQ_FLUSH_INTERVAL     = 300;

// Supported Transport Protocols    
const SUPPORTED_PROTOCOLS   = exports.SUPPORTED_PROTOCOLS = ["tcp:", 
                                                             "proc:", 
                                                             "sock:"];

// Enable support for MemStream, if possible.
try { 
  const MemStream = require("memstream").MemStream;
  const MemServer = require("memstream").MemServer;
  SUPPORTED_PROTOCOLS.push("mem:");
} catch(e){ }

var requestTimeoutHandles   = {};


/**
 *  ### messaging.send(...)
 *
 *  The chainable version of `'channel.send'´ and `'message.send'`. The  
 *  function can be used in two ways, either in chaining mode or by passing 
 *  the channel/message as the context.
 *
 *  Message's sent with this function is automatically encoding using 
 *  channels prefered `encoding` method. Respones is also decoded using
 *  the same method.
 *
 *  Example using `send` with `json` as encoding;
 *  
 *    var channel = createChannel("req");
 *    channel.encoding = "json";
 *    send(channel, "ping", "message", function(a, b) {
 *      console.log(a); // "pong"
 *      console.log(b); // "message"
 *    });
 *
 *  Example using in a chain:
 *
 *    channel.on("message", mmatch( 
 *      when ("ping", String) (
 *        send("pong", $(0))
 *      ) 
 *    ));
 *
 *  Example using with context:
 *
 *    channel.on("message", function(msg) {
 *      var graph = decode(msg, "json");
 *      if (graph[0] == "ping") {
 *        send.call(msg, "pong", graph[1]);
 *      }
 *    });
 */
exports.send = function() {
  var graph = Array.prototype.slice.call(arguments);
  var lastarg = graph[graph.length - 1];
  var inargs;
  var ctx;
  var payload;
  var sendcallback;
  var usercallback;
  
  if (typeof lastarg == "function" &&
      !isDynamic(lastarg)) {
    usercallback = graph.pop();
    sendcallback = function(msg) {
      var graph = decode(msg, ctx.encoding);
      usercallback.apply(null, Array.isArray(graph) && graph || [graph]);
    }
    sendcallback._init = usercallback._init;
  }
  
  if ((typeof graph[0].send == "function" && (ctx = graph.shift())) ||
      (typeof this.send == "function" && (ctx = this))) {
    inargs = [];
    payload = encode(parseDynamics(inargs, graph), ctx.encoding);
    payload._fd = inargs._fd;
    ctx.send(payload, sendcallback);
  } else {
    return function(args) {
      var payload;
      if (!this || typeof this.send != "function") {
        throw new Error("Context is not a channel or message.");
      }
      payload = encode(parseDynamics(args, graph), this.encoding);
      this.send(payload, sendcallback);
      return args;
    }
  }
}

/**
 *  ### messaging.ok()
 *
 *  The chainable version of `'message.ok'´. The function can be used 
 *  in two ways, either by passing it to a ´chain` or by passing the message to
 *  reply to in context.
 *
 *  Example using in a chain:
 *
 *    channel.on("message", mmatch( 
 *      when ("ping") (
 *        ok
 *      ) 
 *    ));
 *
 *  Example using with context:
 *
 *    channel.on("message", function(msg) {
 *      var graph = decode(msg, "json");
 *      if (graph[0] == "pong") {
 *        ok.call(msg);
 *      }
 *    });
 */
exports.ok = function() {
  
}

/**
 *  ### messaging.$fd(stream) **dynamic**
 *
 *  Sends a file-descriptor from a `'stream'` along with the message.
 *
 *  Example:
 *    
 *    channel = createChannel("master");
 *    channel.encoding = "json";
 *    channel.bind("sock://workers");
 *    send(channel, "take-control-of", $fd(stream), function(msg) {
 *      if (msg.toString() == "ok") {
 *        console.log("The FD was over-taken by remote");
 *      } else {
 *        console.log("The FD was NOT over-taken by remote");
 *      }
 *    });
 *
 *  Note: This feature is only supported by channels bound to the two 
 *  unix-protocol's, `sock` and `proc`.
 *
 *  See also: release(stream)
 */
exports.$fd = function(stream) {
  
  if (!stream || !stream.fd || !stream.pause) {
    throw new Error("Expected a Stream instance.");
  }
    
  return createDynamic(function() {
    if (this._fd) {
      throw new Error("A message can only contain one FD");
    }
    stream.pause();
    this._fd = stream.fd;
    return stream.fd;
  });
}

/**
 *  ### messaging.reject()
 *
 *  The chainable version of `'message.reject'´. The function can be used 
 *  in two ways, either by passing it to a ´chain` or by passing the message to
 *  reply to in context.
 *
 */
exports.reject = function() {
  if (typeof this.send == "function") {
    this.reject();
  } else {
    return function(ctx) {
      if (!ctx || typeof ctx.send != "function") {
        throw new Error("Context is not a channel or message.");
      }
      ctx.reject();
      return this;
    }
  }  
}

/**
 *  ### messaging.mmatch()
 */
exports.mmatch = function() {
  var args = Array.prototype.slice.call(arguments);
  var options = {
    prematch: function(args, out) {
      var msg;
      if (args[0].send) {
        msg = args.shift();
        out.channel = out.context;
        out.context = msg;
        return decode(msg, msg.encoding);
      }
      return args;
    }
  }
  return Matcher(args, options);
}


function implement(ctorA, ctorB) {
  for (var key in ctorB.prototype) {
    ctorA.prototype[key] = ctorB.prototype[key];
  }
}

/**
 *  ## messaging.Channel
 *
 *  A Channel represents a message transport bridge. There is a number of 
 *  different type of channels, each with it's own characteristics. To create
 *  a new Channel object, use ´require("parall").createChannel. 
 *
 *  Available channel types are:
 *    
 *  * ´master´ represent a master channel. A master channel accepts new worker
 *    channel connections. 
 *
 *  * 'worker' represents a worker channel. A worker channel is used to connect
 *    to a master channel.
 *
 *  * 'resp' represents a response channel. A response channel accepts new
 *    request channel connections.
 *
 *  * 'req' represents a request channel. A request channel is used to connect
 *    to a response channel.
 *
 *  * 'pub' represents a publisher channel. A publisher channel accepts new
 *    subscriber channel connections.
 *
 *  * 'sub' represents a subscriber channel. A subscriber channel is used to 
 *    connect to a publisher channel.
 * 
 *  This is an `EventEmitter` with the following events:
 *
 *  ### Event: 'closing'
 *
 *  ´function() { }´
 *
 *  This event is emitted when the channel is about to close.
 *
 *  ### Event: 'close'
 *
 *  ´function() { }´
 *   
 *  This event is emitted when the channel is completely closed.
 *
 *  ### Event: 'endpointConnect'
 *
 *  ´function(stream) { }´
 *   
 *  This event is emitted when a new endpoint connects to the channel.
 *
 *  ### Event: 'endpointDisconnect'
 *
 *  ´function(stream) { }´
 *   
 *  This event is emitted when a connected endpoint disconnects.
 *
 *  ## Channel.type
 *  
 *  Returns the channel type (listed above).
 *
 *  ### Channel.encoding
 *  
 *  Get or sets prefered encoding for this channel. The message is NOT 
 *  encoded/decoded on send/receive. This property only sets the prefered
 *  encoding method, which can be used by third-party utility functions.
 *
 *  See valid encoding methods in the "encodings" section.
 */
function Channel(type) {
  this.type = type;
  this.encoding = "raw";
  this.closing = false;
  this.closed = false;
  this._remoteEndpoints = [];
}

exports.Channel = Channel;
inherits(Channel, EventEmitter);

/**
 *  ### messaging.createChannel(type)
 *
 *  Returns a new channel object of specified ´'type'´. 
 *
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

/**
 *  ### Channel.send(msg)
 *
 *  Sends the specified `'msg'` buffer to the channel. 
 *
 *  The `send` method works differently between channel types. The 
 *  request/response based channels, `'req'` and `'master'`, send the message 
 *  to one of it's endpoints (based on a round-robin algorithm). The 
 *  publish/subscribe based channel, `'pub'`, send the message to all 
 *  connected endpoints.
 *
 *  The request/response version of the method also takes an optional
 *  `'callback'` argument, that is called upon a valid response.
 *
 *  Example using a `'req'` channel:
 *
 *    var channel = createChannel("req");
 *    channel.send(new Buffer("ping"), function(msg) {
 *      console.log("Response from remote: %s", msg);
 *    });
 */
Channel.prototype.send = function(msg) {}

// Object.defineProperty(Channel.prototype, "encoding", {
//   get: function() { 
//     return this._encoding;
//   }, 
//   set: function(value) {
//     var enc = value ? value.toLowerCase() : null;
//     if (ENCODING[enc]) {
//       this._encoding = enc;
//       this._encodeData = ENCODING[enc].encode;
//       this._decodeData = ENCODING[enc].decode;
//     } else {
//       throw new Error("Encoding ´" + enc + "´ is not supported");
//     }
//   }
// });

/**
 *  ### Channel.close()
 *
 *  The close method shall destroy all active socket connections. All outgoing
 *  messages are dropped. All new incomming messages are ignored.
 */
Channel.prototype.close = function() {
  var endpoints = this._remoteEndpoints;
  var index;
  
  if (this.closing || this.closed) {
    return;
  }
  
  index = endpoints.length;
  
  while (index--) {
    endpoints[index].end();
  }
  
  this.closing = true;
  this.onclosing && this.onclosing();
  this.emit("closing");  
}

//
//  SenderImpl
//
function SenderImpl() {
  this._sendQueue = [];
  this._sendQueue.size = 0;
  this._sendQueueJobRunning = false;
  this._broadcastEndpointFilter = defaultBroadcastEndpointFilter;
  this._broadcastEndpointFilterOptions = {};
}

//
//  Overrides Channel.send
//
SenderImpl.prototype.send = function(msg) {
  var buffer;
  
  if (!Buffer.isBuffer(msg)) {
    throw new Error("Expected a Buffer instance");
  }
  
  buffer = buildMessage(msg, 0, 0);

  this._sendMsg(buffer);
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
    
    if (throttle) {
      throttle = true;
      self.emit("throttleStop");
    }

    var handle = processSendQueueJob(queue, endpoints, filter, opts);
    
    if (handle) {
      self.emit("throttleStart");

      handle.ondrain = function() {
        throttle = true;
      }
      process.nextTick(run);        
    } else {
      self._sendQueueJobRunning = false;
    }
  }
  
  process.nextTick(run);
}

//
//  RequesterImpl
//
function RequesterImpl() {
  this._requestQueue = [];
  this._readyRemoteEndpoints = [];
  this._requestQueueJobRunning = false;
  
  this._sideQueue = [];
  this._sideQueueJobRunning = false;
  
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
  var waitpool = ep._ackWaitPool;
  var keys = Object.keys(waitpool);
  var index = this._readyRemoteEndpoints.indexOf(ep);
  var queue = this._requestQueue;
  var key;
  var msg;

  if (index !== -1) {
    this._readyRemoteEndpoints.splice(index, 1);
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
}

//
//  Overrides Channel.send
//
RequesterImpl.prototype.send = function(msg, callback) {
  var buffer;

  if (!Buffer.isBuffer(msg)) {
    throw new Error("Expected a Buffer instance");
  }

  buffer = buildMessage(msg, 0, 0);

  if (callback) {
    buffer._callback = callback;
    callback._init && callback._init(buffer);
  }
  
  this._requestQueue.push(buffer);
  
  if (!this._requestQueueJobRunning) {
    this._startRequestQueueJob();
  }
}

RequesterImpl.prototype._startRequestQueueJob = function() {
  var self = this;
  var queue = this._requestQueue;
  var endpoints = this._readyRemoteEndpoints;

  // Return if we send queue already is being processed or 
  // no sendqueue or no ready endpoints.
  if (this._requestQueueJobRunning || 
      !queue.length || 
      !endpoints.length) {
    return;
  }

  this._requestQueueJobRunning = true;

  function run() {
    var fullendpoints = null;
    var index = 0;
    var endpoint = null;
	  
    fullendpoints = processRequestQueueJob(queue, endpoints);

    if (fullendpoints) {
      index = fullendpoints.length;
      while (index--) {
        endpoint = fullendpoints[index];
        endpoint._waitingForFlush = true;

        function ondrain() {
          this._waitingForFlush = false;
          this.removeListener("drain", ondrain);
          endpoints.push(this);
          if (queue.length && !self._requestQueueJobRunning) {
            self._startRequestQueueJob();
          }
        }
        
        endpoint.on("drain", ondrain);
      }
    }

    self._requestQueueJobRunning = false;
  }
  
  process.nextTick(run);
}

RequesterImpl.prototype._startSideQueueJob = function() {
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

RequesterImpl.prototype._processMessage = function(endpoint, raw) {
  var endpoints = this._readyRemoteEndpoints;
  var queue = this._requestQueue;
  var sidequeue = this._sideQueue;
  var waitpool = endpoint._ackWaitPool;
  var ack = raw[ACK_OFFSET];
  var req = waitpool[ack];
  var ackfree = false;
  var msg;

  // Ignore message if we currently doesn't have a
  // corresponding wait handle or messages that is flaged as
  // OPTION. 
  if (!req || (raw[FLAG_OFFSET] & OPTION) == OPTION) {
    return;
  }
  
  msg = raw.slice(PAYLOAD_OFFSET, raw.length);

  // Free ack handle in endpoint wait pool
  waitpool[ack] = undefined;
  ackfree = (endpoint.outgoingCount-- == endpoint.outgoingMax);
	
  // Push endpoint back to endpoint if not write queue is full
  // and currently not in list.
  if (!endpoint._waitingForFlush && ackfree) {
    endpoints.push(endpoint);
  }
  
  // Message was rejected by remote endpoint. The endpoint was probably
  // busy. Queue message again for a second try.
  // 
  // else
  // 
  // We got a succesfull response. Notify user, if requested.
  if ((raw[FLAG_OFFSET] & REJECT) == REJECT) {
    sidequeue.push(req);
    if (!this._sideQueueJobRunning) {
      this._startSideQueueJob();
    }
  } else {
    if (req._callback) {
      req._callback.call(null, msg);                                   
    } else {
      this._events && this._events["message"] && this.emit("message", msg);
    }
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

ResponderImpl.prototype._processMessage = function(endpoint, raw) {
  var msg;
  
  if (raw.length < PAYLOAD_OFFSET || 
      !this._events || 
      !this._events["message"]) {
    return;
  }

  msg = raw.slice(PAYLOAD_OFFSET, raw.length);

  initAckMessage(endpoint, raw[ACK_OFFSET], msg, this.encoding);
  this.emit("message", msg);
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
    payload = new Buffer(" " + keys[index], "binary");
    payload[0]= SUBSCRIBE
    msg = buildMessage(payload, OPTION, 0);
    ep.write(msg);
  }
  
  index = exclusions.length;

  while (index--) {
    payload = new Buffer(" " + exclusions[index], "binary");
    payload[0] = EXCLUDE;
    msg = buildMessage(payload, OPTION, 0);
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

    payload = new Buffer(" " + source, "binary");
    payload[0] = EXCLUDE;
    msg = buildMessage(payload, OPTION, 0);

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

    payload = new Buffer(" " + source, "binary");
    payload[0] = INCLUDE;
    msg = buildMessage(payload, OPTION, 0);

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

    payload = new Buffer(" " + pattern, "binary");
    payload[0] = SUBSCRIBE;
    msg = buildMessage(payload, OPTION, 0);

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

      payload = new Buffer(" " + pattern, "binary");
      payload[0] = UNSUBSCRIBE;
      msg = buildMessage(payload, OPTION, 0);

      while (index--) {
        endpoint = endpoints[index];
        if (endpoint.writable) {
          endpoints[index].write(msg);
        }
      }
    }
  }  
}

/**
 *  ### Channel.pause()
 *
 *  Pause incomming message from all remote endpoints.
 *
 *  This features is only supported by the `'sub'` channel.
 */
SubscriberImpl.prototype.pause = function() {
  var endpoints = this._remoteEndpoints;
  var index = endpoints.length;

  while (index--) {
    endpoints[index].pause();
  }  
}

/**
 *  ### Channel.resume()
 *
 *  Resumes incomming message from all remote endpoints.
 *
 *  This features is only supported by the `'sub'` channel.
 */
SubscriberImpl.prototype.resume = function() {
  var endpoints = this._remoteEndpoints;
  var index = endpoints.length;

  while (index--) {
    endpoints[index].resume();
  }  
}

SubscriberImpl.prototype._processMessage = function(endpoint, raw) {
  var msg;

  if ((raw[FLAG_OFFSET] & OPTION) == OPTION || !this._events) {
    return;
  }

  this._events["rawmessage"] && this.emit("rawmessage", raw);

  if (this._events["message"] && raw.length > PAYLOAD_OFFSET) {
    msg = raw.slice(PAYLOAD_OFFSET, raw.length);
    this.emit("message", msg);
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
  channel.on("rawmessage", this._sendMsg.bind(this));
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


PublisherImpl.prototype._processMessage = function(endpoint, raw) {
  var pattern = getString(this.encoding, OPTIONVAL_OFFSET, raw);
  var index;
  var exclusions;
  var subs;
  var index;

  // Ignore all message's that isn't flag with OPTION
  if ((raw[FLAG_OFFSET] & OPTION) != OPTION) {
    return;
  }

  switch (raw[PAYLOAD_OFFSET]) {
    
    case INCLUDE:
      exclusions = endpoint._exclusions;
    
      if (exclusions && (index = exclusions.indexOf(pattern)) != -1) {
        exclusions.splice(index, 1);
      }
      break;
      
    case EXCLUDE:
      exclusions = endpoint._exclusions;
      
      if (!exclusions) {
        exclusions = endpoint._exclusions = [pattern];
      } else if (exclusions.indexOf(pattern) == -1) {
        exclusions.push(pattern);
      }
      break;
    
    case SUBSCRIBE:
      subs = endpoint._subscriptions;

      if (!subs) {
        subs = endpoint._subscriptions = [pattern];
        
        if (pattern.length == 0) {
          endpoint._nullSubscriptions = true;
        }
        
        this._addSubscription(endpoint, pattern);
      } else if (subs.indexOf(pattern) == -1) {
        
        if (pattern.length == 0) {
          endpoint._nullSubscriptions = true;
        }
        
        subs.push(pattern);
        this._addSubscription(endpoint, pattern);
      }
      
      break;
      
    case UNSUBSCRIBE:
      subs = endpoint._subscriptions;

      if (!subs || (index = subs.indexOf(pattern)) == -1) {
        return;
      }
      
      if (pattern.length == 0) {
        endpoint._nullSubscriptions = false;
      }
      
      subs.splice(index, 1);
    
      this._removeSubscription(endpoint, pattern);      
      break;

    default:
      console.log("PublisherImpl: invalid option type " + raw[PAYLOAD_OFFSET]);
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
  this._bindEndpoints = {};
}

exports.ServerChannel = ServerChannel;
inherits(ServerChannel, Channel);

ServerChannel.prototype.onclosing = function() {
  for (var href in this._bindEndpoints) {
    this._bindEndpoints[href] && this._bindEndpoints[href].close();
  }
}

/**
 *  ### Channel.bind(url, [callback])
 *
 *  Bind an address to this channel. The `'url'` is the address
 *  that should be bound. The `'callback'` is optional and is 
 *  triggered on connect or error.
 *
 *  This example bind's the channel to tcp address 127.0.0.1 on
 *  port 7000:
 *
 *    var channel = createChannel("pub");
 *    channel.bind("tcp://127.0.0.1:7000");
 *
 *  Channel's with the bind method are: `resp`, `master` and `pub`.
 */
ServerChannel.prototype.bind = function(epUrl, callback) {
  var self = this;
  var url = parseUrl(epUrl);
  var host = url.hostname == "*" ? undefined : url.hostname;
  var port = parseInt(url.port);
  var bindargs = null;
  var protocol = url.protocol.toLowerCase();
  var SClass = Server;  
  var serverep = null;
  
  if (this.closing || this.closed) {
    throw new Error("Channel is closing/closed");
  }
  
  if (this._bindEndpoints[url.href]) {
    throw new Error("Channel is already attached to endpoint.");
  }
  
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) == -1) {
    throw new Error("Protocol ´" + protocol + "´ is not supported");
  }
  
  function onconnect() {
    serverep.removeListener("error", onerror);
    callback && callback(null, epUrl);
  }
  
  function onerror(error) {
    serverep.removeListener("error", onerror);
    callback && callback(error);
  }
    
  protocol == "tcp:" && (bindargs = [url.port, url.hostname]);
  protocol == "sock:" && (bindargs = [url.hostname]);
  protocol == "proc:" && (bindargs = [createProcSockAlias(url.hostname)]);
  protocol == "mem:" && (bindargs = [url.hostname]) && (SClass = MemServer);
  
  try {
    serverep = new SClass();
    serverep._endpointUrl = url;
    bindargs.push(onconnect);
    serverep.listen.apply(serverep, bindargs);
  } catch (err) {
    onerror(err);
    return;
  }

  serverep.on("connection", function(ep) {
    
    // Do not accept new connections while closing channel.
    if (self.closing) {
      ep.end();
      return;
    }
    
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
 *  ### Channel.attach(fd)
 *
 *  Attach a FD to this server channel.
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
  
  ep.on("error", function(err) { console.log(err.stack) });

  ep.on("end", function() {
    this.end();
  });
  
  ep.on("close", function() {
    var index = self._remoteEndpoints.indexOf(this);

    if (index !== -1) {
      self._remoteEndpoints.splice(index, 1);
    }

    self.emit("endpointDisconnect", this);
    
    // Raise ´close´ if we are closing.
    if (self.closing && !self._remoteEndpoints.length) {
      self.closing = false;
      self.closed = true;
      self.emit("close");
    }
  });  
}

/**
 *  Base class for Client Channels
 */
function ClientChannel(type) {
  Channel.call(this, type);
  
  this.autoReconnect = true;
  this._reconnectJobRunning = false;
  this._endpointUrlMap = {};

  this._reconnectSlots = [];
  
  for (var i = 0; i < MAX_RECONNECT_SLOTS; i++) {
    this._reconnectSlots[i] = [];
  }
}

exports.ClientChannel = ClientChannel;
inherits(ClientChannel, Channel);

ClientChannel.prototype.connect = function(epurl, options) {
  var opts = Object.create(options || {});
  var url = parseUrl(epurl);
  var connectargs = null;
  var protocol = url.protocol;
  var SClass = Stream;
  
  // We do not want duplicates connection to same endpoint. 
  if (this._endpointUrlMap[url.href]) {
    return;
  }
  
  if (SUPPORTED_PROTOCOLS.indexOf(protocol) == -1) {
    throw new Error("Protocol ´" + protocol + "´ is not supported");
  }
  
  protocol == "tcp:" && (connectargs = [url.port, url.hostname]);
  protocol == "sock:" && (connectargs = [url.hostname]);
  protocol == "proc:" && (connectargs = [createProcSockAlias(url.hostname)]);
  protocol == "mem:" && (connectargs = [url.hostname]) && (SClass = MemStream);
  
  this._endpointUrlMap[url.href] = true;
  
  this._connect(SClass, url.href, connectargs, opts, 0);
}

ClientChannel.prototype._connect = function(SClass, href, args, opts, attempt) {
  var self = this;
  var ep = new SClass();
  var connected = false;
  
  function reconnect() {
    var orig = Math.floor(attempt / ATTEMPTS_PER_SLOT);
    var slotno = ((orig >= MAX_RECONNECT_SLOTS && MAX_RECONNECT_SLOTS - 1))
                 || orig;

    self._reconnectSlots[slotno].push([SClass, href, args, opts, attempt + 1]);

    return (!self._reconnectJobRunning && self._startReconnectJob());
  }
  
  ep.connect.apply(ep, args);
  
  ep.on("connect", function() {

    initStream(this);

    ep._originType = opts.originType || null;
    ep._processMessage = self._processMessage.bind(self);

    self._remoteEndpoints.push(ep);
    
    ep.on("end", function() {
      this.end();
    });

    ep.on("close", function(hadError) {
      var index = self._remoteEndpoints.indexOf(this);
      var reconnectEndpoint = null

      notEqual(index, -1);

      self.emit("endpointDisconnect", this, hadError && self.autoReconnect);
      
      // Raise ´close´ if we are closing.
      if (self.closing && !self._remoteEndpoints.length) {
        self.closing = false;
        self.closed = true;
        self.emit("close");
      }
    });
    
    self.emit("endpointConnect", ep);
  });
  
  ep.on("error", function(err) {

    // Reconnect endpoint if channel is in auto reconnect mode, else
    // delete the endpoint form endpointUrlMap.
    reconnectEndpoint = (!self.closing && self.autoReconnect && !reconnect()) ||
                          (delete self._endpointUrlMap[href]);
  });
  
}

ClientChannel.prototype._startReconnectJob = function() {
  var self = this;

  if (this._reconnectJobRunning) {
    return;
  }
  
  this._reconnectJobRunning = true;
  
  process.nextTick(function loop() {
    var containsMoreJobs = false;
    var slots = self._reconnectSlots;
    var jobs = slots.shift();
    var index = jobs.length;
    
    while (index--) {
      self._connect.apply(self, jobs[index]);
    }
    
    index = 0;
    
    while ((jobs = slots[index++])) { 
      if (jobs.length) {
        containsMoreJobs = true;
        break;
      }
    }

    slots.push([]);
    
    (containsMoreJobs && setTimeout(loop, RECONNECT_INTERVAL)) ||
      (self._reconnectJobRunning = false);
      
  });
}

/**
 *  Initializes a new RequestChannel instance.
 */
function RequestChannel() {
  ClientChannel.call(this, "req");
  RequesterImpl.call(this);
}

exports.RequestChannel = RequestChannel;
inherits(RequestChannel, ClientChannel);
implement(RequestChannel, RequesterImpl);

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
  RequesterImpl.call(this);
}

exports.MasterChannel = MasterChannel;
inherits(MasterChannel, ServerChannel);
implement(MasterChannel, RequesterImpl);

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
  var pendingFD;
  var multipartcache;
  var multipartsize;
  
  function parseAndProcessMessage(msg) {
    var flag = msg[FLAG_OFFSET];

    // The message is a multipart message. Check if this is the first
    // part. If not, append to multipartPayload buffer.
    if ((flag & MULTIPART) == MULTIPART) {
      if (multipartcache) {
        multipartcache.push(msg);
        multipartsize += msg.length - PAYLOAD_OFFSET;
      } else {
        multipartcache = [msg];
        multipartsize = msg.length - PAYLOAD_OFFSET;
      }
      return;
    }
    
    // The message is last message in a multipart sequence. Construct
    // a new message from all messages in multipart payload cache.
    if ((flag & MULTIPART_LAST) == MULTIPART_LAST) {
      if (multipartcache) {
        multipartcache.push(msg);
        multipartsize += msg.length - PAYLOAD_OFFSET;
      } else {
        multipartcache = [msg];
        multipartsize = msg.length - PAYLOAD_OFFSET;
      }

      msg = buildMultipartMessage(multipartcache, multipartsize);
      multipartcache = undefined;
      multipartsize = undefined;
    }

    msg.fd = pendingFD;
    msg.origin = self;
    
    if (pendingFD) {
      // Save off recvMsg.fd in a closure so that, when we emit it later, 
      // we're emitting the same value that we see now. Otherwise, we can 
      // end up calling emit() after recvMsg() has been called again and 
      // end up emitting null (or another FD).
      (function(inmsg) {
        process.nextTick(function() {
          self._processMessage(self, inmsg);
        });
      })(msg);
      pendingFD = undefined;
    } else {
      self._processMessage(self, msg);
    }
  }
  
  if (self.type == "unix") {
    self._readImpl = function(buf, off, len, calledByIOWatcher) {
      var bytesRead = recvMsg(self.fd, buf, off, len);

      if (recvMsg.fd !== null) {
        pendingFD = recvMsg.fd;
      }

      return bytesRead;
    };
  }
  
  // MemStream doesn't need a message parser. We always expects 
  // complete messages to be received.
  if (self.type == "mem") {
    self.on("data", function(buffer) {
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
      parseAndProcessMessage(cbuffer);

      // Read next message
      cpos = 0;
      cbuffer = sizeBuffer;
    }
  }
}

/**
 * Process specified request queue.
 */
function processRequestQueueJob(queue, endpoints) {
  var endpoint = null;
  var msg = null;
	var ack = null;
	var waitpool = null;
	var flushed = false;
	var fullendpoints = null;

  while (queue.length && endpoints.length) {
    msg = queue.shift();

    while ((endpoint = endpoints.shift())) {

      // Check if endpoint is writable. Try next 
      // endpoint if not. 
      if (!endpoint.writable && !endpoint.fd) {
        continue;
      }
      
      // Trying to send a FD message, but current endpoint 
      // does not support it? Push endpoint back to 
      // readyEndpoints. 
      //
      // Note: This can genereate some overhead, if same 
      // endpoint is called twice. 
      if (msg._fd && endpoint.type != "unix") {
        endpoints.push(endpoint);
        continue;
      }

      // Find free ack no for this msg
      waitpool = endpoint._ackWaitPool;
      ack = endpoint.outgoingMax + 1;
      while (ack-- && waitpool[ack]) { }

      // Couldn't find a free handle for message. Enqueue 
      // again and wait for a ready endpoint.
      // 
      // Note: This should never happen, because we remove the
      //       endpoint from readyRemoteEndpoints.
      notEqual(ack, 0);

      // Set message ack to the one generated.
      msg[ACK_OFFSET] = ack;

      if (msg._fd) {
        flushed = endpoint.write(msg, null, msg._fd);
      } else {
        flushed = endpoint.write(msg);
      }

      waitpool[ack] = msg;
      msg.endpoint = endpoint;
      endpoint.outgoingCount++;

      if (endpoint.outgoingCount < endpoint.outgoingMax) {
        if (!flushed) {
          !fullendpoints && (fullendpoints = []);
          fullendpoints.push(endpoint);
        } else {
          endpoints.push(endpoint);
        }
      } 

      // Message was sent, break loop
      break;
    }
  }
	
	return fullendpoints;
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
      
      try {
        if (!endpoint.write(msg)) {

          if (!drainWaitHandle) {
            drainWaitHandle = new DrainWaitHandle();
          }

          drainWaitHandle.push(endpoint);
        }
      } catch (error) {}
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
  var longest = Math.min(opts.longestKey, msg.length - PAYLOAD_OFFSET);
  var pattern = msg.toString("binary", PAYLOAD_OFFSET, PAYLOAD_OFFSET + longest);
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


function buildMessage(payload, flags, ack) {
  var plength = (payload && payload.length) || 0;
  var poffset;
  var length;
  var parts;
  var offset;
  var msg;
  var psize;
  var pflags;
  var msize
  
  if (plength > PAYLOAD_MAX) {
    parts = Math.ceil(plength / PAYLOAD_MAX);
    length = plength + (HEADER_SIZE * parts);
    msg = new Buffer(length);
    offset = 0;
    poffset = 0;
    
    while (parts--) {
      plength -= (psize = PAYLOAD_MAX > plength ? plength : PAYLOAD_MAX);
      msize = HEADER_SIZE + psize;
      pflags = flags | ((parts && MULTIPART) || MULTIPART_LAST);
      msg[offset + LENGTH_OFFSET    ] = Math.floor(msize / 256) & 0xff;
      msg[offset + LENGTH_OFFSET + 1] = msize % 256;
      msg[offset + FLAG_OFFSET      ] = pflags;
    	msg[offset + ACK_OFFSET       ] = ack;
      payload.copy(msg, offset + PAYLOAD_OFFSET, poffset, poffset + psize);
    	offset += msize;
    	poffset += psize;
    }

  } else {
    length = plength + HEADER_SIZE;
    msg = new Buffer(length);

    msg[LENGTH_OFFSET    ] = Math.floor(length / 256) & 0xff;
    msg[LENGTH_OFFSET + 1] = length % 256;
    msg[FLAG_OFFSET      ] = flags;
  	msg[ACK_OFFSET       ] = ack;

    payload && payload.copy(msg, PAYLOAD_OFFSET, 0, payload.length);
  }

  msg._fd = payload._fd;
  
  return msg;  
}

function buildMultipartMessage(cache, payloadSize) {
  var msg = new Buffer(HEADER_SIZE + payloadSize);
  var pos = PAYLOAD_OFFSET;
  var first = cache[0];
  var part;
  var ack;

  for (var i=0, l=cache.length; i < l; i++) {
    part = cache[i];
    part.copy(msg, pos, PAYLOAD_OFFSET);
    pos += part.length - PAYLOAD_OFFSET;
  }

  msg[FLAG_OFFSET] = first[FLAG_OFFSET];
  msg[ACK_OFFSET] = first[ACK_OFFSET];
  
  return msg;
}

// Extends an ack-based messages with a set of 
// utility-functions.
function initAckMessage(endpoint, ack, msg, encoding) {
  
  /**
   *  ### Message.handled
   *
   *  The encoding method of this message.
   */
  msg.encoding = encoding;
  
  /**
   *  ### Message.handled
   *
   *  Indicates if message has been handled or not.
   */
  msg.handled = false;
  
  /**
   *  ### Message.reject()
   * 
   *  Rejects this message. The remote node should choose another 
   *  endpoint to handle this message. 
   *
   *  Note: The reject function should be used for load-balancing purposes
   *        only. Use reject when current node is busy and not as a way
   *        to discard unwanted messages.
   *
   */
   msg.reject = function() {
     var buffer;
     
     if (msg.handled) {
       throw new Error("A response has already been sent for message.");
     }
     
     buffer = buildMessage(null, REJECT, ack);
     
     try {
       endpoint.write(buffer);
       msg.handled = true;
     } catch(err) {}
   }

   /**
    *  ### Message.send(response)
    *
    *  Replies to specified message with an answer. 
    */
   msg.send = function(response) {
     var buffer;
     
     if (!response || !response.length) {
       throw new Error("Excpected a response message");
     }
     
     if (msg.handled) {
       throw new Error("A response has already been sent for message.");
     }
     
     buffer = buildMessage(response, 0, ack);
     
     try {
       endpoint.write(buffer);
       msg.handled = true;
     } catch(err) {}
   }
}

function createProcSockAlias(alias) {
  var pid = process.__parallMainProcessPID ? process.__parallMainProcessPID :
                                             process.pid;

  return ["/tmp/parall-", pid, "-", alias, ".sock"].join("");
}