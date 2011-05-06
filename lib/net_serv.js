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

var SERVICE = exports.SERVICE = "net_serv";


var createServer  = require("net").createServer;
var sendAfter     = require("./index").sendAfter;



//
//  ### net.start(name, port, hidden)
//
//  
//
exports.start = function(name, port, hidden) {
  var me = self();
  var ref;

  if (whereis(SERVICE)) {
    throw new Error(SERVICE + " already running");
  }

  spawn(function() {
    // TODO: link this nodule, to check for errors at startup.
    ref = spawn(netserv, [name, port, hidden]);
    send(ref, ["ping", self()]);
    receive();
    send(me, ["ok"]);
  });

  receive();

  return ref;
};



//
//  ### net.stop() 
//
//  Stops `net_serv`. All node connections will terminate.
//
exports.stop = function() {
  var ref;

  if (ref = whereis(SERVICE)) {
    send(ref, ["stop", self()]);

    return receive(
      function ok() { return true; },
      function err() { return false; }
    );
  }

  return false;
};



//
// Try to create a TCP server for specified port. If successed, this
// node becomes the `master` node. 
// 
// If not, try to connect to the master node (via sockname) instead, and
// register. The name of the master-node is always stored in 
// `master.lock` which is found in the `port-dir`.
//
// Nodes marked with `hidden` is not visible outside this host, so no
// need for a TCP interface.
//
function netserv(name, port, hidden) {
  var masterLockFile;
  var sockpath;
  var kerneliface;
  var masterConn;
  var sockserv;
  var tcpserv;
  var result;
  var log;

  log = require("./log_serv").getLog(SERVICE);

  send("kernel", ["_registerService", SERVICE, self()]);

  receive(
    function regok(iface) { kerneliface = iface; },
    function regerr() { return exit("alreadyRunning"); }
  );

  result = hidden ? null : createNodeServ(port, null, kerneliface);

  if (result !== null && !(result instanceof Error)) {
    log("running as `master` at %s", result.address().port);

    masterLockFile = new MasterLockFile(name);

    if ((result = masterLockFile.lock()) instanceof Error) {
      log("failed to lock master-lock-file, reason %s", result.message);
      throw result;
    }

    log("master-lock-file locked");

    tcpserv = result;
    tcpserv.isMaster = true;
  } else if (!hidden) {
    result = createNodeServ();
    if (result instanceof Error) {
      throw result;
    }
    tcpserv = result;
  }

  if (!tcpserv || !tcpserv.isMaster) {
    result = connectToMasterNode(port);
    if (result instanceof Error) {
      if (tcpserv) {
        tcpserv.close();
      }
      throw result;
    }
    masterConn = result;
  }

  result = resolveNetPath(port, name);

  if (result instanceof Error) {
    throw result;
  }

  result = createNodeServ(result);

  if (result instanceof Error) {
    throw sockserv;
  }

  sockserv = result;

  while (sockserv) {
    receive (
      function ping(from) { send(from, ["pong"]); },

      function stop() {
        if (masterConn) {
          masterConn.close();
          masterConn = null;
        }

        if (tcpserv) {
          tcpserv.close();
          tcpserv = null;
        }

        if (sockserv) {
          sockserv.close();
          sockserv = null;
        }
      }
    );
  }
};




function MasterLockFile(port, name) {
  this.port = port;
  this.name = name;
}

MasterLockFile.prototype.lock = function() {
  var fiber = Fiber.current;
  var result = resolveNetPath(this.port);
  var fs = require("fs");

  if (result instanceof Error) {
    return result;
  }

  fs.writeFile(result, name, function(err) {
    fiber.run(err || null);
  });

  return Fiber.yield();
};

MasterLockFile.prototype.unlock = function() {
  var fiber = Fiber.current;
  var result = resolveNetPath(this.port);
  var fs = require("fs");

  if (result instanceof Error) {
    return result;
  }

  fs.unlink(result, function(err) {
    fiber.run(err || null);
  });

  return Fiber.yield();
};

function resolveNetPath(port, name) {
  var fiber = Fiber.current;
  var dirpath = process.env["PARALL_NET_PATH"] || "/var/tmp/parall";
  var path = require("path");
  var fs = require("fs");
  var target = path.join(dirpath);
  var dirs = target.split("/").slice(1);
  var curdir;
  var err;

  function mkdir(p) {
    path.exists(p, function(exists) {
      if (!exists) {
        fs.mkdir(p, function(err) {
          fiber.run(err || null);
        });
        Fiber.yield();
      } else {
        fiber.run();
      }
    });
    return Fiber.yield();
  }

  for (var i = 0, l = dirs.length; i < l; i++) {
    curdir = "/" + path.join(dirs.slice(i));
    if ((err = mkdir(curdir))) {
      return err;
    }
  }

  return name ? path.join(target, name) : target;
}

function connectToMasterNode(port) {
  var fiber = Fiber.current;
  var dir = resolveNetPath(port);
  var lockpath = path.join(dir, "master.lock");
  var name = require("fs").readfileSync(lockpath, "utf8");
  var sock = createConnection(name);

  function onconnect() {

  }

  sock.once("connect", onconnect);

  return Fiber.yield();
}


//
// Creates a new Node Server on specified port/host or sockname.
//
// Returns the newly created Server on success or Error on failure.
//
function createNodeServ(port, host, kernel) {
  var fiber = Fiber.current;
  var serv;

  function onListenOrErr(err) {
    serv.removeListener("error", onListenOrErr);

    if (!err) {
      serv.on("connection", function(sock) {
        sockImplementationMethods(sock);
        sock.receive = nodeHandshakeImpl;
      });
    }

    fiber.run(err || serv);
  }

  serv = createServer();

  serv.once("listening", onListenOrErr);
  serv.once("error", onListenOrErr);
  serv.listen(port, host);

  return Fiber.yield();
}




function getServer() {

  if (server) {
    return server;
  }

  server = createServer();
  serverImplementationMethods(server);

  server.listen();
}


function serverImplementationMethods(server) {
  server.on("connection", function(sock) {
    sockImplementationMethods(sock);
    sock.on("connect", function() {
      sock.name;
    });
    sock.on("disconnect", function(nodename) {
      sock.name;
    });
  });
}

function sockHandshakeImpl(op, buffer, start, end) {

  if (op !== 128) {
    this.destroy(new Error("Bad handshake"));
    return;
  }
  
}

//
//	Remote node message dispatcher
//
//
function sockMessageImpl(op, buffer, start, end) {
  var graph;

  try {
    graph = JSON.parse(buffer.toString("utf8", start, end));
  } catch (jsonException) {
    this.destroy(jsonException);
    return;
  }


  switch (op) {
    case 1: // spawn
      
      break;
    case 2: // link
      break;
      
    case 3: // send
      
      break;
  }
}



function sockImplementationMethods(sock) {
  var recvcallback;
  var buffer;
  var offset;
  var length;

  sock.ondata = function(chunk, start, end) {
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

    while (offset < length && !sock.destroyed) {

      if (offset + 4 > length) {
        return;
      }

      msglen = (buffer[offset + 1] << 16 |
                buffer[offset + 2] << 8 |
                buffer[offset + 3]) + (buffer[0] << 24 >>> 0);

      if (offset + msglen > length) {
        return;
      }

      this.receive(buffer[offset + 4], buffer, offset + 5, offset + msglen);

      offset += msglen;
    }

    if (length - offset === 0) {
       buffer = null;
    }
  }

  sock.on("error", function(err) {
    // Report this somehow.
  });
  sock.on("close", function(hadError) {
    if (this.receive !== sockHandshakeImpl) {
      node.emit("disconnect");
    }
  });
}
