const Buffer            = require("buffer").Buffer
    , print             = require("util").print
    , spawn             = require("../../lib").spawn
    , createChannel     = require("../../lib").createChannel
    , equal             = require("assert").equal

var testsubject
  , instructions;

switch (process.argv[2]) {
  
  case "test-leader":
    instructions = createChannel("resp");
    instructions.listen("proc://instructions");

    instructions.receive = function test1(msg) {
      process.nextTick(function() {
        print("test1");
      });
      msg.ok();
    };
    
    instructions.receive = function test2(msg) {
      testsubject = spawn("./worker", "pipe", ["test-subject"]);
      testsubject.on("exit", function(code, signal) {
        equal(code, 0);
        equal(signal, null);
      });
      msg.ok();
    };
    break;
    
  case "test-subject":
    print("test2");
    break;
}

