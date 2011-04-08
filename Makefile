NODE=$(shell which node)

test-all:
		${NODE} tools/node-test/lib/test.js -r test

validate:
		${NODE} tools/validate.js $(CURDIR)/lib -r