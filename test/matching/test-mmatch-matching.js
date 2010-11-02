const Buffer            = require("buffer").Buffer
    , ok                = require("assert").ok
    , equal             = require("assert").equal
    , deepEqual         = require("assert").deepEqual
    , mmatch            = require("../../lib").mmatch
    , when              = require("../../lib").when

var m = null
  , matched = null
  , matchResult = null
  , matchedId = null


var fakeMessage = new Buffer(JSON.stringify(["abc", 123]), "utf8");
fakeMessage.id = 1;
fakeMessage.encoding = "json";
fakeMessage.send = function() {};

function result(no) {
  return function(args, callback) {
    matchResult = args;
    matched = no;
    matchedId = this.id;
    return args;
  }
}
    
m = mmatch(
  when ("abc", 123) (
    result(1)
  )
);

ok(m(fakeMessage)) || equal(matched, 1) || deepEqual(matchResult, []) ||
  equal(matchedId, 1);