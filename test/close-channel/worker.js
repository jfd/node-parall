const createChannel     = require("../../index").createChannel

var resp = createChannel("resp");
resp.connect("proc://worker-pool");