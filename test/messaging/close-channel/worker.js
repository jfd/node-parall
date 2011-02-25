const createChannel     = require("../../../lib").createChannel

var resp = createChannel("resp");
resp.connect("proc://worker-pool");