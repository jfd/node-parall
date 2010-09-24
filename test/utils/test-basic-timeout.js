const equal               = require("assert").equal
    , ok                  = require("assert").ok
    , timeout             = require("../../lib/utils").timeout


var callback
  , calls = 0;


timeout(50, function(o) {
  equal(o, "TIMEOUT");
  calls++;
});


callback = timeout(50, function(o) {
  equal(o, "test");
  calls++;
});

process.nextTick(function() {
  callback("test");
});

setTimeout(function() {
  equal(calls, 2);
}, 150);