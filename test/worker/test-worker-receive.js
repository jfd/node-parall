const equal             = require("assert").equal
    , spawn             = require("../../lib").spawn
    , isWorker          = require("../../lib").isWorker
    , receive           = require("../../lib").receive
    , timeout           = require("../common").timeout
    , shutdown          = require("../common").shutdown

timeout(5000);

if (isWorker()) {
  receive (
    "test", function() {
      this.ok()
    },
    "shutdown", function() {
      process.exit();
    }
  );
} else {
  var worker = spawn(__filename, ["child"], "pipe");  
  worker.send("test");
  worker.on("message", function(msg, state) {
    equal(state, 'OK');
    worker.send("shutdown");
  });
  worker.on("exit", function() {
    shutdown();
  });
}


