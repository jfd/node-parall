const equal             = require("assert").equal
    , doesNotThrow      = require("assert").doesNotThrow
    , createChannel     = require("../../index").createChannel
    , spawn             = require("../../index").spawn
    , geturi            = require("../../index").geturi
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

const TCP_PORT          = require("../common").TCP_PORT
    , TCP_HOST          = require("../common").TCP_HOST
    
timeout(5000);

function procTest() {
  var ch = null;
  var req = null;
  var pool = null;
  
  ch = createChannel("req");
  ch.connect("proc://server");

  req = ch.send("test");
  req.recv = function ok(msg) {
    process.nextTick(sockTest);
  };
  
  spawn("./proc_server");  
}


function sockTest() {
  var ch = null;
  var req = null;
  var pool = null;

  ch = createChannel("req");
  ch.connect("sock://server");

  req = ch.send("test");
  req.recv = function ok(msg) {
    process.nextTick(tcpTest);
  };

  spawn("./sock_server");  
}

function tcpTest() {
  var ch = null;
  var req = null;
  var pool = null;

  ch = createChannel("req");
  ch.connect(geturi("tcp", TCP_HOST, TCP_PORT));
  
  req = ch.send("test");
  req.recv = function ok(msg) {
    shutdown();
  };
  
  spawn("./tcp_server");
}

process.nextTick(procTest);