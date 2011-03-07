const openStdMsg     = require("../../../lib/util").openStdMsg

var worker = null
  , rejectMode = false;


openStdMsg().receive = function setReject(msg, value) {
  rejectMode = value;
  msg.send("ok", process.pid);
};

openStdMsg().receive = function ping(msg) {
  if (rejectMode) {
    msg.reject();
  } else {
    msg.send("pong", process.pid);
  }
};