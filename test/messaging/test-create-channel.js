const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../../lib/messaging").createChannel
    , MasterChannel     = require("../../lib/messaging").MasterChannel
    , WorkerChannel     = require("../../lib/messaging").WorkerChannel
    , ResponseChannel   = require("../../lib/messaging").ResponseChannel
    , RequestChannel    = require("../../lib/messaging").RequestChannel
    , SubscriberChannel = require("../../lib/messaging").SubscriberChannel
    , PublisherChannel  = require("../../lib/messaging").PublisherChannel


ok(createChannel("master") instanceof MasterChannel);
ok(createChannel("worker") instanceof WorkerChannel);
ok(createChannel("resp") instanceof ResponseChannel);
ok(createChannel("req") instanceof RequestChannel);
ok(createChannel("sub") instanceof SubscriberChannel);
ok(createChannel("pub") instanceof PublisherChannel);
    
throws(function() { createChannel("invalid_channel") });