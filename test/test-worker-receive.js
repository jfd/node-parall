const equal             = require("assert").equal
    , spawn             = require("../index").spawn
    , stdmsg            = require("../index").stdmsg
    , timeout           = require("./common").timeout
    , shutdown          = require("./common").shutdown

timeout(5000);

if (process.argv[2] == "worker") {
  
  stdmsg.recv = function test(msg) {
    msg.ok();
  };
  
  stdmsg.recv = function shutdown(msg) {
    process.exit();
  };
  
} else {
  var worker = spawn(__filename, ["worker"], "pipe");  
  worker.send("test").recv = function ok(msg) {
    worker.send("shutdown").recv = function() {};
  };
  worker.on("exit", function() {
    shutdown();
  });
}
