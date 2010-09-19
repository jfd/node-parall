const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , match             = require("../../lib/matching").match
    

var m = null
  , matched = null
  , matchResult = null;


function result(no) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    matchResult = args;
    matched = no;
  }
}
    
m = match(
  
  // Number and string testing
  "s", result(1),
  "s1", "s2", result(2),
  "s1", 1, result(3),
  String, Number, result(4),
  "s2", String, Number, result(5),
  
  // Array testing
  ["s"], result(6),
  [String, Number], result(7),
  [[String], [Number]], result(8),
  [[[String]], [[Number]]], result(9),
  "array", Array, result(10),
  
  // Object testing
  {a: "a"}, result(11),
  {b: Number}, result(12),
  {a: "s", ba: Number}, result(13),
  {ab: String, bc: Number}, result(14),
  {c:{a: Number}, aa: String, bb: Number}, result(15)
);

// Number and string testing
ok(m("s")) || equal(matched, 1) || deepEqual(matchResult, []);
ok(m("s1", "s2")) || equal(matched, 2) || deepEqual(matchResult, []);
ok(m("s1", 1)) || equal(matched, 3) || deepEqual(matchResult, []);
ok(m("s2", 1)) || equal(matched, 4) || deepEqual(matchResult, ["s2", 1]);
ok(m("s2", "s", 1)) || equal(matched, 5) || deepEqual(matchResult, ["s", 1]);

// Array testing
ok(m(["s"])) || equal(matched, 6) || deepEqual(matchResult, []);
ok(m(["s2", 1])) || equal(matched, 7) || deepEqual(matchResult, ["s2", 1]);
ok(m([["s2"], [1]])) || equal(matched, 8) || deepEqual(matchResult, ["s2", 1]);
ok(m([[["s2"]], [[1]]])) || equal(matched, 9) || 
  deepEqual(matchResult, ["s2", 1]);
ok(m("array", ["value"])) || equal(matched, 10) || 
  deepEqual(matchResult, [["value"]]);

// Object testing
ok(m({a: "a"})) || equal(matched, 11) || deepEqual(matchResult, []);
ok(m({b: 1})) || equal(matched, 12) || deepEqual(matchResult, [1]);
ok(m({a: "s", ba: 1})) || equal(matched, 13) || deepEqual(matchResult, [1]);
ok(m({ab: "s", bc: 1})) || equal(matched, 14) || deepEqual(matchResult, ["s", 1]);
ok(m({aa: "s", bb: 1, c:{a: 1}})) || equal(matched, 15) || 
  deepEqual(matchResult, [1, "s", 1]);
