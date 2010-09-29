const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib/matching").match
    , when              = require("../../lib/matching").when
    , _                 = require("../../lib/matching").wildcard
    

var m = null
  , matched = null
  , matchResult = null


function result(no) {
  return function(ctx, callback) {
    matchResult = this;
    matched = no;
    return this;
  }
}
    
m = match(
  
  when ("s", _, Number) (
    result(1)
  ),
      
  when (_) (
    result(2)
  )
  
);

ok(m("s", 1, 1)) || equal(matched, 1) || deepEqual(matchResult, [1]);
ok(m(1, 1)) || equal(matched, 2) || deepEqual(matchResult, []);
