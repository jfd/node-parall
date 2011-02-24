const equal             = require("assert").equal
    , doesNotThrow      = require("assert").doesNotThrow
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , geturi            = require("../../../lib").geturi
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST
    
timeout(5000);

function procTest() {
  var req = null;
  var pool = null;
  
  req = createChannel("req");
  req.connect("proc://server");
  req.send("test", function(msg, state) {
    equal(state, 'OK');
    process.nextTick(sockTest);
  });
  spawn("./proc_server");  
}


function sockTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.connect("sock://server");
  req.send("test", function(msg, state) {
    equal(state, 'OK');
    process.nextTick(tcpTest);
  });
  spawn("./sock_server");  
}

function tcpTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.connect(geturi("tcp", TCP_HOST, TCP_PORT));
  req.send("test", function(msg, state) {
    equal(state, 'OK');
    shutdown();
  });
  spawn("./tcp_server");
}

process.nextTick(procTest);