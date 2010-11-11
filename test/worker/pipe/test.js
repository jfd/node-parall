const Buffer            = require("buffer").Buffer
    , equal             = require("assert").equal
    , spawn             = require("../../../lib").spawn
    , createChannel     = require("../../../lib").createChannel
    , timeout           = require("../../common").timeout
    , shutdown          = require("../../common").shutdown

var testleader  = null
  , instructions = null
  , testphase = "test1"
  , tests = [];

timeout(5000);

instructions = createChannel("req");
instructions.connect("proc://instructions");

testleader = spawn("./worker", "test-leader");
testleader.on("exit", function(code, signal) {
  equal(code, null);
  equal(signal, 'SIGHUP');
  shutdown();
});
testleader.stdout.on("data", function(data) {
  equal(data.toString(), testphase);
  process.nextTick(startnext);
}); 

tests.unshift({ phase: "test1", callback:function() {
  instructions.send(new Buffer("test1", "ascii"), function(msg) {
    equal(msg.toString(), 'OK');
  });  
}});

tests.unshift({ phase: "test2", callback:function() {
  instructions.send(new Buffer("test2", "ascii"), function(msg) {
    equal(msg.toString(), 'OK');
  });  
}});

function startnext() {
  var test = tests.pop();
  if (test) {
    testphase = test.phase;
    process.nextTick(test.callback);
  } else {
    testleader.kill('SIGHUP');
  }
}

process.nextTick(startnext);