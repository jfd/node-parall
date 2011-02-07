const equal             = require("assert").equal
    , createChannel     = require("../../../lib").createChannel
    , send              = require("../../../lib/").send
    , decode            = require("../../../lib/").decode
    , receive           = require("../../../lib/").receive

var worker = null
  , count = 0;
  
receive (
  'do', function() {
    this.send('OK', process.pid.toString() + (count++));
  }
);