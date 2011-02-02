const createChannel     = require("../../../lib").createChannel

var worker = null
  , rejectMode = false;

worker = createChannel("worker");
worker.connect("proc://worker-pool");
worker.on("message", function(msg) {
  if (msg.graph[0] == "set-reject") {
    rejectMode = true;
    msg.send("ok", process.pid);
  } else if (msg.graph[0] == "ping") {
    if (rejectMode) {
      msg.reject();
    } else {
      msg.send("pong", process.pid);
    }
  } else {
    throw new Error("Bad message");
  }
});