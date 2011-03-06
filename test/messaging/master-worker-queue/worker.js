const equal             = require("assert").equal
    , openStdMsg        = require("../../../lib/util").openStdMsg

var worker = null
  , count = 0;
  
openStdMsg().receive = function test(msg) {
  msg.send("ok", process.pid.toString() + (count++));
};
