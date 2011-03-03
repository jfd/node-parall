const assert                    = require("assert");

const defineDispatcher          = require("../lib/util").defineDispatcher;


function Class() {}

defineDispatcher(Class.prototype, "d1");
defineDispatcher(Class.prototype, "d2");
defineDispatcher(Class.prototype, "d3", { configurable: true });

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

assert.equal(cls.d1("ok"), "ok");
assert.equal(cls.d1("ok", "message"), "message");
assert.equal(cls.d1("ok", "message", "message2"), "message2");
assert.equal(cls.d1("undefined"), "undefined");
assert.equal(cls.d1("undefined", "undefined"), "undefined");
assert.equal(cls.d1("undefined", "asd", "asd", "asd"), "undefined");

cls.d2 = function temp() {};

assert.throws(function() {
  cls.d2 = function temp() {};
});

assert.equal(cls.d2("undefined"), -1);

assert.equal(cls.d2("temp"), undefined);

cls.d2 = null;

assert.equal(cls.d2("temp"), -1);


cls.d3 = function temp() { return "1st"};

assert.doesNotThrow(function() {
  cls.d3 = function temp() { return "2nd"}
});

assert.equal(cls.d3("temp"), "2nd");

cls.__addHandler__("d3", function ok() {
  return "ok";
});

assert.equal(cls.d3("ok"), "ok");

cls.__removeHandler__("d3", "ok/0");

assert.equal(cls.d3("ok"), -1);
