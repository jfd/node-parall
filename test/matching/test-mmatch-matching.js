const ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , mmatch            = require("../../lib/matching").mmatch
    , when              = require("../../lib/matching").when

var m = null
  , matched = null
  , matchResult = null
  , matchedId = null


function FakeMessage() {
  this.id = 1;
  this.data = ["abc", 123];
}

function result(no) {
  return function(ctx, callback) {
    matchResult = this;
    matched = no;
    matchedId = ctx.id;
    return this;
  }
}
    
m = mmatch(
  when ("abc", 123) (
    result(1)
  )
);

ok(m(new FakeMessage())) || equal(matched, 1) || deepEqual(matchResult, []) ||
  equal(matchedId, 1);