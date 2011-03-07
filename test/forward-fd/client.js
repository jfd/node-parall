const ok                = require("assert").ok
    , equal             = require("assert").equal
    , createConnection  = require("net").createConnection;
    
const TCP_PORT          = require("../common").TCP_PORT
    , TCP_HOST          = require("../common").TCP_HOST;
    
const DATA              = "test-data";
    
var connection;

connection  = createConnection(TCP_PORT, TCP_HOST);
connection.setEncoding("utf8");
connection.on("connect", function() {
  this.write(DATA, "utf8");
});

connection.on("data", function(data) {
  equal(DATA, data);
  process.exit();
});
