const equal             = require("assert").equal
    , doesNotThrow      = require("assert").doesNotThrow
    , createChannel     = require("../../../lib").createChannel
    , spawn             = require("../../../lib").spawn
    , timeout           = require("../../global").timeout
    , shutdown          = require("../../global").shutdown

const TCP_PORT          = require("../../global").TCP_PORT
    , TCP_HOST          = require("../../global").TCP_HOST
    
timeout(5000);

function procTest() {
  var req = null;
  var pool = null;
  
  req = createChannel("req");
  req.encoding = "json";
  req.connect("proc://server");
  req.send("test", function(answer) {
    equal(answer, "ok");
    process.nextTick(sockTest);
  });
  pool = spawn("./proc_server", 1);  
}


function sockTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.encoding = "json";
  req.connect("sock://server");
  req.send("test", function(answer) {
    equal(answer, "ok");
    process.nextTick(tcpTest);
  });
  pool = spawn("./sock_server", 1);  
}

function tcpTest() {
  var req = null;
  var pool = null;

  req = createChannel("req");
  req.encoding = "json";
  req.connect("tcp://" + TCP_HOST + ":" + TCP_PORT);
  req.send("test", function(answer) {
    equal(answer, "ok");
    shutdown();
  });
  pool = spawn("./tcp_server", 1);  
}

process.nextTick(procTest);