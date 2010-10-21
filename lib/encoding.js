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

const Buffer                = require("buffer").Buffer;

const ENCODING              = exports.ENCODING = {};

/**
 *  ## Encoding
 *
 *  The encoding module provides a set of encoding/decoding utility functions.
 *
 *  Valid encodings are:
 *
 *  * ´raw´ used plain `'Buffer'`objects (default).
 *  * ´json` encodes/decodes messages using JSON.
 *  * `ascii´ encodes/decodes messages using ASCII. 
 *  * `msgpack` encodes/decodes messages using the MsgPack format. In order
 *    to use MsgPack, you have to install the library 
 *    "http://github.com/pgriess/node-msgpack"
 */


/**
 *  ### encoding.encode(graph, encoding)
 *
 *  Encodes provided `'graph'` into a Buffer object, using the 
 *  specfied `'encoding'` method.
 *
 *  Example: encode an object with 'json' as encoding:
 *
 *    encode(["hello", "world"], "json");
 *    // <Buffer 5b 22 68 65 6c 6c 6f 22 2c 22 77 6f 72 6c 64 22 5d>
 */
exports.encode = function(graph, encoding) {
  if (!ENCODING[encoding]) {
    throw new Error("Invalid encoding method: " + encoding);
  }
  return ENCODING[encoding].encode(graph);
}

/**
 *  ### encoding.decode(buffer, encoding)
 *
 *  Decodes provided `'buffer'` into a javascript object, using the
 *  specified `'encoding'` method.
 *
 *  Example: decode a buffer with json data into an object
 *
 *    decode(new Buffer("\x5b\x22\x68\x65\x6c\x6c\x6f\x22\x5d"), "json");
 *    // ["hello"]
 */
exports.decode = function(buffer, encoding) {
  if (!ENCODING[encoding]) {
    throw new Error("Invalid decoding method: " + encoding);
  }
  return ENCODING[encoding].decode(buffer);
}

// Define raw encoding methods.
ENCODING["raw"] = {};
ENCODING["raw"].encode = function(graph) {
  if (graph.length == 1 && Buffer.isBuffer(graph[0])) {
    return graph[0];
  } else {
    throw new Error("TODO: Convert to a larger buffer");
  }
}
ENCODING["raw"].decode = function(buffer, startPos) {
  return buffer.slice(startPos, buffer.length);
}

// Define ascii encoding methods.
ENCODING["ascii"] = {};
ENCODING["ascii"].encode = function(graph) {
  var data = graph.join("");
  var buffer = new Buffer(Buffer.byteLength(data, "ascii"));
  buffer.write(data, 0, "ascii")
  return buffer;
}
ENCODING["ascii"].decode = function(buffer, startPos) {
  return buffer.toString("ascii", startPos);
}

// Define json encoding methods.
ENCODING["json"] = {};
ENCODING["json"].encode = function(graph) {
  var data = JSON.stringify(graph);
  var buffer = new Buffer(Buffer.byteLength(data, "utf8"));
  buffer.write(data, 0, "utf8")
  return buffer;
}
ENCODING["json"].decode = function(buffer, startPos) {
  return JSON.parse(buffer.toString("utf8", startPos));
}

// Try to define msgpack encoding methods.
try {
  var msgpackPack = require("msgpack").pack;
  var msgpackUnpack = require("msgpack").unpack;
  ENCODING["msgpack"] = {};
  ENCODING["msgpack"].encode = function(graph) {
    return msgpackPack(graph);
  }
  ENCODING["msgpack"].decode = function(buffer, startPos) {
    return msgpackUnpack(buffer.slice(startPos, buffer.length));
  }  
} catch (msgpackImportError) {
  // ignores msgpack support
}

/**
 *  Returns a string representation of a buffer 
 */
exports.getString = function(enc, offset, graph) {
  switch (enc) {
    case "raw": return graph.toString("binary", offset, graph.length);
    case "ascii": return graph.toString("ascii", offset, graph.length);
    case "msgpack": return "";
    case "json": return JSON.stringify(graph);
  }
}

