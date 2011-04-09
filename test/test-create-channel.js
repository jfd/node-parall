const ok                = require("assert").ok
    , throws            = require("assert").throws
    , createChannel     = require("../index").createChannel
    , RespChannel       = require("../lib/resp").RespChannel
    , ReqChannel        = require("../lib/req").ReqChannel
    , SubChannel        = require("../lib/sub").SubChannel
    , PubChannel        = require("../lib/pub").PubChannel


ok(createChannel("resp") instanceof RespChannel);
ok(createChannel("req") instanceof ReqChannel);
ok(createChannel("sub") instanceof SubChannel);
ok(createChannel("pub") instanceof PubChannel);
    
throws(function() { createChannel("invalid_channel") });