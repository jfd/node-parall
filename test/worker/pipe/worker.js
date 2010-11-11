const Buffer            = require("buffer").Buffer
    , print             = require("util").print
    , spawn             = require("../../../lib").spawn
    , createChannel     = require("../../../lib").createChannel
    , equal             = require("assert").equal

var testsubject
  , instructions;

switch (process.argv[2]) {
  
  case "test-leader":
    instructions = createChannel("resp");
    instructions.bind("proc://instructions");
    instructions.on("message", function(msg) {
      switch (msg.toString()) {
        case "test1":
          process.nextTick(function() {
            print("test1");
          });
          msg.send(new Buffer('OK', "ascii"));
          break;
          
        case "test2":
          testsubject = spawn("./worker", "pipe", "test-subject");
          testsubject.on("exit", function(code, signal) {
            equal(code, 0);
            equal(signal, null);
          });
          break;
      }
    });
    break;
    
  case "test-subject":
    print("test2");
    break;
}

