test-all:
	node tools/node-test/lib/test.js -r test
  
test-messaging:
	node tools/node-test/lib/test.js -r test/messaging
