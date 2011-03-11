const openStdMsg     = require("../../lib/util").openStdMsg

var worker = null
  , rejectMode = false;


openStdMsg().recv = function setReject(msg, value) {
  rejectMode = value;
  msg.send("ok", process.pid);
};

openStdMsg().recv = function ping(msg) {
  if (rejectMode) {
    msg.reject();
  } else {
    msg.send("pong", process.pid);
  }
};