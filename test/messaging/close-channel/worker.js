const createSocket     = require("../../../lib").createSocket

worker = createSocket("resp");
worker.connect("proc://worker-pool");
worker.on("close", function() {
  console.log("cloooooooooo")
});