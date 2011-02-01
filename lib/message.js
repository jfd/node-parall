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
const Stream                = require("stream").Stream
    , inherits              = require("util").inherits


// Message Contants
const LENGTH_OFFSET         = exports.LENGTH_OFFSET   = 0x00
    , LENGTH_SIZE           = exports.LENGTH_SIZE     = 0x02
    , FLAG_OFFSET           = exports.FLAG_OFFSET     = 0x02
    , FLAG_SIZE             = exports.FLAG_SIZE       = 0x01
    , ACK_OFFSET            = exports.ACK_OFFSET      = 0x03
    , ACK_SIZE              = exports.ACK_SIZE        = 0x01;
    
const HEADER_SIZE           = exports.HEADER_SIZE     = LENGTH_SIZE 
                                                      + FLAG_SIZE 
                                                      + ACK_SIZE;
                                                  
const PAYLOAD_OFFSET        = exports.PAYLOAD_OFFSET  = FLAG_OFFSET 
                                                      + FLAG_SIZE 
                                                      + ACK_SIZE;
                                                     
const PAYLOAD_MAX           = exports.PAYLOAD_MAX     = 0xFFFF - HEADER_SIZE;

const OPTIONVAL_OFFSET      = exports.OPTIONVAL_OFFSET = PAYLOAD_OFFSET + 1;

// Message Flags
const OPTION                = exports.OPTION          = 0x01
    , REJECT                = exports.REJECT          = 0x02
    , MULTIPART             = exports.MULTIPART       = 0x04
    , MULTIPART_LAST        = exports.MULTIPART_LAST  = 0x08
    , COMPLEX               = exports.COMPLEX         = 0x10


const FD_HASH               = {__fdhash__: 22 };
    
    
var createComplexMessage = 
exports.createComplexMessage = function (arr, flags, ack) {
  var payload;
  var index;
  var obj;
  
  index = arr.length;
  
  // Need better implmentation of this later on. 
  while (index--) {
    if ((obj = arr[index]) && 
        obj instanceof Stream && 
        obj.fd &&
        obj.pause) {
      obj.pause();
      arr[index] = FD_HASH;
    }
  }

  payload = new Buffer(JSON.stringify(arr), "utf8");

  return createMessage(payload, flags | COMPLEX, ack);
};   

var createMessage = 
exports.createMessage = function (payload, flags, ack) {
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

  payload && (msg._fd = payload._fd);

  msg._off = 0;
  
  return msg;  
};


exports.sendImpl = function(graph, callback) {
  var msg;

  if (graph.length == 0) {
    return;
  }
  
  if (graph[0] instanceof Buffer) {
    // Fast messages, call create message on the buffer.
    
    msg = createMessage(graph[0], 0 ,0);
    
  } else {
    // Complex messages, is of course more complex, and
    // requires more time to process.

    msg = createComplexMessage(graph, 0, 0);
  }
  
  msg._callback = callback;

  return this._sendmsg(msg, true);
}

// `instance` is used for multipart parsning.
exports.parseMessage = function(buffer, instance) {
  var cache = instance._multipartcache;
  var flag = buffer[FLAG_OFFSET];
  var graph;
  var mpartmsg;
  var mpartpos;
  var first;
  var part;
  var ack;
  var msg;

console.log("flag. %s, %s", flag, (flag & MULTIPART) == MULTIPART)
  // The message is a multipart message. Check if this is the first
  // part. If not, append to multipartPayload buffer.
  if ((flag & MULTIPART) == MULTIPART) {
    if (cache) {
      cache.push(msg);
      cache.size += buffer.length - PAYLOAD_OFFSET;
    } else {
      cache = instance._multipartcache = [buffer];
      cache.size = buffer.length - PAYLOAD_OFFSET;
    }
    return;
  }
  
  // The message is last message in a multipart sequence. Construct
  // a new message from all messages in multipart payload cache.
  if ((flag & MULTIPART_LAST) == MULTIPART_LAST) {
    if (cache) {
      cache.push(buffer);
      cache.size += buffer.length - PAYLOAD_OFFSET;
    } else {
      cache = instance._multipartcache = [buffer];
      cache.size = buffer.length - PAYLOAD_OFFSET;
    }
    
    // Combind all message parts into one unified message
    msg = new Message(HEADER_SIZE + cache.size, instance);
    mpartpos = PAYLOAD_OFFSET;
    first = cache[0];

    for (var i=0, l=cache.length; i < l; i++) {
      part = cache[i];
      part.copy(buffer, mpartpos, PAYLOAD_OFFSET);
      mpartpos += part.length - PAYLOAD_OFFSET;
    }

    msg[FLAG_OFFSET] = first[FLAG_OFFSET];
    msg[ACK_OFFSET] = first[ACK_OFFSET];

    instance._multipartcache = void(0);
  } else {
    msg = buffer;
  }
  
  if ((flag & COMPLEX) == COMPLEX) {
    graph = JSON.parse(msg.toString("utf8", PAYLOAD_OFFSET));
    
    index = graph.length;

    // Need better implmentation of this later on. 
    while (index--) {
      if ((obj = graph[index]) && 
          obj["__fdhash__"] == 22) {

        graph[index] = instance._pendingfd;
      }
    }
    
    msg.graph = graph;
  } else {
    msg.graph = msg.slice(PAYLOAD_OFFSET);
  }
  
  return msg;
}

function Message(size, origin) {
  Buffer.call(this, size);
  this.origin = origin;
  this._handled = false;
}

exports.Message = Message;
inherits(Message, Buffer);

Object.defineProperty(Message.prototype, 'rejected', {
  get: function() {
    return (this[FLAG_OFFSET] & REJECT) == REJECT;
  }
});


Object.defineProperty(Message.prototype, 'option', {
  get: function() {
    if ((this[FLAG_OFFSET] & OPTION) == OPTION) {
      return this[PAYLOAD_OFFSET];
    } else {
      return 0;
    }
  }
});


Message.prototype.reject = function() {
  var buffer;
  var ack;
  var origin;
  
  if ((ack = this[ACK_OFFSET]) == 0 || !(origin = this.origin)) {
    throw new Error("Cannot reject a message that doesnt need a response.");
  }
  
  if (this._handled) {
    throw new Error("A response has already been sent for message.");
  }
  
  this._handled = true;
  
  buffer = createMessage(null, REJECT, ack);
  
  origin._sendmsg(buffer, true);
};


Message.prototype.send = function() {
  var graph = Array.prototype.slice.call(arguments);
  var reply;
  var ack;
  var origin;

  if ((ack = this[ACK_OFFSET]) == 0 || !(origin = this.origin)) {
    throw new Error("Cannot reject a message that doesnt need a response.");
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