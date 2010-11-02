const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib/matching").match
    , when              = require("../../lib/matching").when
    

var m = null
  , matched = null
  , matchResult = null
  , calls;


function result(no) {
  return function(args, callback) {
    calls = 1;
    matchResult = args;
    matched = no;
    return args;
  }
}

function second() {
  calls++;
  return this;
}
    
m = match(
  
  when ("single-function") (
    result(1)
  ),
  
  when ("chained-functions") (
    result(2),
    second
  ),
  
  when ("chained-w-arg", String) (
    result(3),
    second
  )  
);

ok(m("single-function")) || equal(matched, 1) || deepEqual(matchResult, []);
ok(m("chained-functions")) || equal(matched, 2) || 
  deepEqual(matchResult, []) || equal(calls, 2);
ok(m("chained-w-arg", "test")) || equal(matched, 3) || 
  deepEqual(matchResult, ["test"]) || equal(calls, 2);