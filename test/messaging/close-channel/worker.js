const createChannel     = require("../../../lib").createChannel

var worker = null

worker = createChannel("worker");
worker.connect("proc://worker-pool");