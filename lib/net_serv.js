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
//  ### net_serv.start(name, port, hidden)
//
//  Start Parall networking server "net_serv". The "net_serv" job handles
//  remote connections that needs to communicate with current node.
//
//  Argument `"name"` is required and specifies the name of current node. This
//  name MUST be unique for current TCP-port, which is specified with the
//  `"port"` argument. The `"hidden"` argument is a boolean and indicates if
//  this node should be visible for nodes on other machines or not.
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
//  ### net_serv.stop() 
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
//  ### net_serv.spawnNode(name, host, port) 
//
//  Spawns a new node on current machine. Returns NodeRef.
//
exports.spawnNode = function(name, module, fn) {
  var result;

  if (!whereis(SERVICE)) {
    throw new Error(SERVICE + " is not running");
  }

  send(SERVICE, ["spawn", name, path, fn, hidden]);

  return receive (
    function ok(ref) { return ref; },
    function err(message) { return false; }
  );
}


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
  var lockfile;
  var sockpath;
  var kerneliface;
  var masterconn;
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

    tcpserv = result;
    tcpserv.isMaster = true;

    lockfile = new MasterLockFile(name);

    if ((result = lockfile.lock()) instanceof Error) {
      log("failed to lock master-lock-file, reason %s", result.message);
      tcpserv.close();
      throw result;
    }

    log("`master-lock-file` locked");

  } else if (!hidden) {
    tcpserv = createNodeServ();
    if (tcpserv instanceof Error) {
      throw tcpserv;
    }
  }

  if (!tcpserv || !tcpserv.isMaster) {
    var masterpath = resolveNetPath(port, "master.lock");
    var name = require("fs").readfileSync(masterpath, "utf8");
    mastekconn = connectToMasterNode(port, name);
    if (masterconn instanceof Error) {
      if (tcpserv) {
        tcpserv.close();
      }
      throw result;
    }
  }

  result = resolveNetPath(port, name);

  if (result instanceof Error) {
    throw result;
  }

  sockserv = createNodeServ(result);

  if (sockserv instanceof Error) {
    log("faild to start `sockserv`, reason %s", sockserv.message);
    throw sockserv;
  }

  log("`sockserv` started at %s", result);

  while (sockserv) {
    receive (

      function ping(from) { send(from, ["pong"]); },

      function stop() { shutdown(masterconn,
                                 tcpserv,
                                 sockserv,
                                 lockfile)},

      //
      // spawns a new node and waits for it to connect.
      // { name, path, fn, hidden }
      //
      function spawnNode(from, opts) { 
        var spawn = require("child_process").spawn;
        var args;
        var child;
        var ref;

        args = ["--blank",
                "--name=" + opts.name,
                "--port=" + port,
                "--host=" + opts.host];

        child = spawn(process.execPath, args);
        
        ref = kernel.register();

        send(from, ["ok", ref]);
      }

    );
  }
};



//
//  Shutdown specified interfaces.
//
function shutdown(masterconn, tcpserv, sockserv, lockfile) {
  if (masterconn) {
    masterconn.close();
  }

  if (tcpserv) {
    tcpserv.close();
  }

  if (sockserv) {
    sockserv.close();
  }

  if (lockfile) {
    lockfile.unlink();
  }
}



//
//  ## MasterLockFile(port, name)
//
//  Provides functionallity to lock and/or unlock the
//  `master-lock-file`.
//
//  Give `"port`" of current `application-space`, give `"name"` of
//  the name of the node.
//
function MasterLockFile(port, name) {
  this.port = port;
  this.name = name;
}



//
//  ### MasterLockFile.lock()
//
//  Locks the `master-lock-file`. The path of the `master-lock-file` is
//  based on arguments to the `constructor`.
//
MasterLockFile.prototype.lock = function() {
  var fiber = Fiber.current;
  var result = resolveNetPath(this.port, "master.lock");
  var fs = require("fs");

  if (result instanceof Error) {
    return result;
  }

  fs.writeFile(result, name, function(err) {
    fiber.run(err || null);
  });

  return Fiber.yield();
};



//
//  ### MasterLockFile.unlock()
//
//  Un-locks the `master-lock-file`. The path of the `master-lock-file` is
//  based on arguments to the `constructor`.
//
MasterLockFile.prototype.unlock = function() {
  var fiber = Fiber.current;
  var result = resolveNetPath(this.port, "master.lock");
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



function connectToNode(kernel, port, name) {
  var fiber = Fiber.current;
  var sock = createConnection(resolveNetPath(port, name));

  sockImplementationMethods(sock, kernel);

  sock.receive = function(kernel, msg) {
    this.removeListener("close", onclose);
    this.removeListener("error", onerror);

    switch (msg[0]) {

      case "ok":
        Fiber.run(kernel.registerSockNode(this, msg[1]));
        return;

      case "notfound":
        sock.destroy();
        return fiber.run(new Error("notfound"));

      case "redirect":
        sock.destroy();
        return fiber.run(connectToNode(kernel, port, msg[1].name));

      default:
        sock.destroy(new Error("bad handshake"));
        break;
    }
  };

  function onconnect() {
    this.send(["handshake", name, kernel.getNodeInfo()]);
  }

  function onerror(err) {
    Fiber.run(err);
  }

  function onclose(haderror) {
    if (haderror == false) {
      Fiber.run(new Error("disconnected"));
    }
  }

  sock.once("connect", onconnect);
  sock.once("close", onclose);

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

    if (err) {
      return fiber.run(err);
    }

    serv.on("connection", function(sock) {
      sockImplementationMethods(sock, kernel);
      sock.receive = sockHandshakeImpl;
    });

    fiber.run(serv);
  }

  serv = createServer();

  serv.once("listening", onListenOrErr);
  serv.once("error", onListenOrErr);
  serv.listen(port, host);

  return Fiber.yield();
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


//
//  ### sockHandshakeImpl(kernel, op, buffer, start, end)
//
//  Wait´s for a handshake message to arrive from a Node.
//
//  The handshake format looks like follows:
//
//      [ "handshake", targetNodeName, { RemoteNodeInfo } ]
//
//  The RemoteNodeInfo graph contains a set of properties 
//  that identifies the node. Valid properties are:
//
//      - `name`, the full-name (includes domain) of the calling
//        RemoteNodeInfo.
//      - `port`, the tcp-port number that the node is listening to. This
//        value is `undefined` if the node is started as `hidden`.
//      - `host`, the tcp-host name of the node. This value is `undefined`
//        if node is started as `hidden`.
//
//  Nodes connected via a unix-socket is always treated as local-nodes.
//
function sockHandshakeImpl(kernel, msg) {
  var msg;
  var name;
  var ref;
  var info;

  if (msg[0] !== "handshake" || 
      typeof msg[1] !== "string" || 
      typeof msg[2] !== "object") {
    this.destroy("bad handshake");
    return;
  }

  info = kernel.getNodeInfo();

  if (msg[1] == info.name) {
    kernel.registerSockNode(this, msg[2]);
    this.receive = sockMessageImpl;
    this.send(["ok", info]);
  } else {
    ref = kernel.getNodeRefForName(msg[1]);
    if (!ref) {
      this.send(["notfound"]);
    } else {
      this.send(["redirect", ref]);
    }
  }
}



//
//	Remote node message dispatcher
//
//
function sockMessageImpl(kernel, msg) {

  switch (msg[0]) {
    case "spawn":
    
      break;

    case "link":
      
      break;

    case "send":
      ref = kernel.getLocalRefById(msg[1]);
      send(ref, msg[2]);
      break;
      
    case "sendn":
      send(whereis(msg[1]), msg[2]);
      break;
  }

}



function sockImplementationMethods(sock, kernel) {
  var recvcallback;
  var buffer;
  var offset;
  var length;

  sock.ondata = function(chunk, start, end) {
    var sidebuffer;
    var msglen;
    var msg;

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

      try {
        msg = JSON.parse(buffer.toString("utf8", offset + 4, offset + msglen));
      } catch (jsonException) {
        this.destroy(jsonException);
        return;
      }

      if (!Array.isArray(msg) || msg.length < 1) {
        this.destroy("bad message format");
        return;
      }

      this.receive(kernel, msg);

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

    this.kernel = null;

    if (this.receive !== sockHandshakeImpl) {
      node.emit("disconnect");
    }
  });
}
