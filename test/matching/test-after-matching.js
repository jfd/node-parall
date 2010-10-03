const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib/matching").match
    , when              = require("../../lib/matching").when
    , after             = require("../../lib/matching").after

var m = null
  , matched = null
  , matchResult = null
  , timeouted


function result(no) {
  return function(ctx, callback) {
    matchResult = this;
    matched = no;
    return this;
  }
}

function timeouthandle() {
  timeouted = true
  return this;
}
    
m = match(
  
  when ("test") (
    result(1)
  ),
  
  after (30) (
    timeouthandle
  )
);

ok(!m("non-match"));

setTimeout(function() {
  ok(timeouted);
}, 60);