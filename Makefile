test-all:
	node tools/node-test/lib/test.js -r test
  
test-messaging:
	node tools/node-test/lib/test.js -r test/messaging
  
test-worker:
	node tools/node-test/lib/test.js -r test/worker
	
test-matching:
	node tools/node-test/lib/test.js -r test/matching
	
test-utils:
	node tools/node-test/lib/test.js -r test/utils