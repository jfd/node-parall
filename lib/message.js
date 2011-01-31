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
    , COMPLEX               = exports.COMPLEX         = 0x16
    
    
exports.createComplexMessage = function(graph, flags, ack) {
  var callback;
  
  if (typeof graph[graph.length] == "function") {
    // Extract callback function
    
    callback = graph.pop();
  }
  
  if (callback) {
    msg = createMessage(payload, flags | COMPLEX, ack);
    msg._callback = callback;
    return msg;
  } else {
    return createMessage(payload, flags | COMPLEX, ack);
  }
};   

exports.createMessage = function createMessage(payload, flags, ack) {
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

  return msg;  
};


exports.createAckMessage = function(socket, ack, msg) {
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
     
     if (!Buffer.isBuffer(response) || !response.length) {
       throw new Error("Excpected a Buffer instance");
     }
     
     if (msg.handled) {
       throw new Error("A response has already been sent for message.");
     }
     
     buffer = exports.createMessage(response, 0, ack);
     
     try {
       socket.write(buffer);
       msg.handled = true;
     } catch(err) {}
   }  
};