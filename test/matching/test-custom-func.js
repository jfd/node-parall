const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib").match
    , when              = require("../../lib").when
    , _                 = require("../../lib")._
    

var m = null
  , matched = null
  , matchResult = null


function result(no) {
  return function(args, callback) {
    matchResult = args;
    matched = no;
    return args;
  }
}

function CustomMatcher(value, result) {
  result.push(1);
  return true;
}
    
m = match(
  
  when ("test", CustomMatcher) (
    
  )
);

ok(m("test", 1, 1)) || equal(matched, 1) || deepEqual(matchResult, [1]);
ok(m(1, 1)) || equal(matched, 2) || deepEqual(matchResult, []);
