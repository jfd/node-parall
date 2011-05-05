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

var Server = require("net").Server;




function createServer() {
  
}

function NetKernel() {
  this.on("connection", this.__onconnection__);
}


NodeServer.prototype.__onconnection__ = function(sock) {

  nodeImplementationMethods(sock);

  sock.receive = nodeHandshakeImpl;

};


exports.nodeImplementationMethods = function(node) {
  var recvcallback;
  var buffer;
  var offset;
  var length;

  node.ondata = function(chunk, start, end) {
    var sidebuffer;
    var msglen;
    var payload;
    var graph;

    if (buffer) {
      sidebuffer = new Buffer((length - offset) + (end - start));
      buffer.copy(sidebuffer, 0, offset, length);
      chunk.copy(sidebuffer, (length - offset), start, end);
      buffer = sidebuffer;
      length = buffer.length;
      offset = 0;
    } else {
      buffer = chunk;
      offset = start;
      length = end;
    }

    while (offset < length && !node.destroyed) {

      if (offset + 4 > length) {
        return;
      }

      msglen = (buffer[offset + 1] << 16 |
                buffer[offset + 2] << 8 |
                buffer[offset + 3]) + (buffer[0] << 24 >>> 0);

      if (offset + msglen > length) {
        return;
      }

      this.receive( self
                  , buffer[offset + 4]
                  , buffer
                  , offset + 5
                  , offset + msglen);

      offset += msglen;
    }

    if (length - offset === 0) {
       buffer = null;
    }
  }

  node.on("error", function(err) {
    // Report this somehow.
  });
  node.on("close", function(hadError) {
    if (this.receive !== nodeHandshakeImpl) {
      node.emit("disconnect");
    }
  });
};
