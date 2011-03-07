const equal             = require("assert").equal
    , spawn             = require("../lib").spawn
    , stdmsg            = require("../lib").stdmsg
    , timeout           = require("./common").timeout
    , shutdown          = require("./common").shutdown

timeout(5000);

if (process.argv[2] == "worker") {
  
  stdmsg.receive = function test(msg) {
    msg.ok();
  };
  
  stdmsg.receive = function shutdown(msg) {
    process.exit();
  };
  
} else {
  var worker = spawn(__filename, ["worker"], "pipe");  
  worker.send("test").receive = function ok(msg) {
    worker.send("shutdown").receive = function() {};
  };
  worker.on("exit", function() {
    shutdown();
  });
}
