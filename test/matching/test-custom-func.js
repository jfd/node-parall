const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib").match
    , type              = require("../../lib").type
    , _                 = require("../../lib")._
    

var m = null
  , matched = null
  , matchResult = null


function result(no) {
  return function(args, callback) {
    console.log(typeof args);
    matchResult = args;
    matched = no;
    return args;
  }
}

function CustomMatcher(value, result) {
  if (value == 1) {
    result.push(value);
    return true;
  } else {
    return false;
  }
}

function OtherCustomMatcher(value, result) {
  if (value == 2) {
    result.push(value, value);
    return true;
  } else {
    return false;
  }
}
    
m = match(
  "test", type(CustomMatcher), result(1),
  "test", type(OtherCustomMatcher), result(2)
);

ok(m("test", 1)) || equal(matched, 1) || deepEqual(matchResult, [1]);
ok(m("test", 2)) || equal(matched, 2) || deepEqual(matchResult, [2, 2]);