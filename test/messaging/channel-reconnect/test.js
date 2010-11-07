const equal             = require("assert").equal
    , doesNotThrow      = require("assert").doesNotThrow
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , send              = require("../../../lib").send
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

const TCP_PORT          = require("../../common").TCP_PORT
    , TCP_HOST          = require("../../common").TCP_HOST
    
timeout(5000);

function procTest() {
  var req = null;
  var pool = null;
  
  req = createChannel("req");
  req.encoding = "json";
  req.connect("proc://server");
  send(req, "test", function(answer) {
    equal(answer, "ok");
    process.nextTick(sockTest);
  });
  spawn("./proc_server");  
}


function sockTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.encoding = "json";
  req.connect("sock://server");
  send(req, "test", function(answer) {
    equal(answer, "ok");
    process.nextTick(tcpTest);
  });
  spawn("./sock_server");  
}

function tcpTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.encoding = "json";
  req.connect("tcp://" + TCP_HOST + ":" + TCP_PORT);
  send(req, "test", function(answer) {
    equal(answer, "ok");
    shutdown();
  });
  spawn("./tcp_server");  
}

process.nextTick(procTest);