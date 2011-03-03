const assert                    = require("assert");

const defineDispatcher          = require("../lib/util").defineDispatcher;


function Class() {}

defineDispatcher(Class.prototype, "d1");
defineDispatcher(Class.prototype, "d2");

var cls = new Class();

cls.d1 = function ok() {
  return this.d1(arguments.callee, "ok");
};

cls.d1 = function ok(message) {
  return this.d1(arguments.callee, "ok", message);
};

cls.d1 = function ok(messageA, messageB) {
  return messageB;
};

cls.d1 = function() {
  return "undefined";
};

cls.d1 = function(message) {
  return message;
};

cls.d2 = function temp() {};

assert.throws(function() {
  cls.d2 = function temp() {};
});

assert.equal(cls.d1("ok"), "ok");
assert.equal(cls.d1("ok", "message"), "message");
assert.equal(cls.d1("ok", "message", "message2"), "message2");
assert.equal(cls.d1("undefined"), "undefined");
assert.equal(cls.d1("undefined", "undefined"), "undefined");
assert.equal(cls.d1("undefined", "asd", "asd", "asd"), "undefined");

assert.equal(cls.d2("undefined"), -1);