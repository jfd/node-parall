var assert = require("assert");
var sendAfter = require("../lib").sendAfter;


exports.start = function() {
  var ref = spawn(function() {
    var msg = receive();
    send(msg[1], ["ok"]);
  });

  assert.ok(register("worker", ref));
  assert.equal(whereis("worker"), ref);
  assert.ok(unregister("worker"));
  assert.deepEqual(registered(), ["worker"]);

  assert.ok(register("worker", ref));
  sendAfter("worker", ["shutdown", self()], 1);
  receive();
  assert.equal(unregister("worker"), true);
  assert.equal(whereis("worker"), null);
};