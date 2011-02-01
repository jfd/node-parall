# Channel





## createChannel(type)

Returns a new channel object of specified ´'type'´. 

## channel.Channel

A Channel represents a message transport bridge. There is a number of 
different type of channels, each with it's own characteristics. 

To create a new Channel object, use ´require("parall").createChannel. 

Available channel types are:
  
* ´master´ represent a master channel. A master channel accepts new worker
  channel connections. 

* 'worker' represents a worker channel. A worker channel is used to connect
  to a master channel.

* 'resp' represents a response channel. A response channel accepts new
  request channel connections.

* 'req' represents a request channel. A request channel is used to connect
  to a response channel.

* 'pub' represents a publisher channel. A publisher channel accepts new
  subscriber channel connections.

* 'sub' represents a subscriber channel. A subscriber channel is used to 
  connect to a publisher channel.

This is an `EventEmitter` with the following events:

### Event: 'closing'

´function() { }´

This event is emitted when the channel is about to close.

### Event: 'close'

´function() { }´
 
This event is emitted when the channel is completely closed.

### Event: 'connect'

´function(stream) { }´
 
This event is emitted when a new socket connects to the channel.

### Event: 'disconnect'

´function(stream) { }´
 
This event is emitted when a connected socket disconnects.


### Channel.type

Returns the channel type (listed above).


### Channel.sockets

Returns an `Array` with all attached sockets. The sockets may
be connecting, connected, disconnecting and/or disconnected.


### Channel.connect(url)

Connect this channel to the specified `'url'`. 

This example connect's the channel to tcp address 127.0.0.1 on
port 7000:

    var channel = createChannel("sub");
    channel.connect("tcp://127.0.0.1:7000");

Channel's with the `connect` method are: `req`, `worker` and `sub`.


### Channel.listen(url, [callback])

Listen for connections on the specified `url`. The `'url'` is the 
address that should be bound. The `'callback'` is optional and is 
triggered on connect or error.

This example bind's the channel to tcp address 127.0.0.1 on
port 7000:

    var channel = createChannel("pub");
    channel.bind("tcp://127.0.0.1:7000");

Channel's with the bind method are: `resp`, `master` and `pub`.



### Channel.send(msg)

Sends the specified `'msg'` buffer to the channel. 

The `send` method works differently between channel types. The 
request/response based channels, `'req'` and `'master'`, send the message 
to one of it's sockets (based on a round-robin algorithm). The 
publish/subscribe based channel, `'pub'`, send the message to all 
connected sockets.

The request/response version of the method also takes an optional
`'callback'` argument, that is called upon a valid response.

Example using a `'req'` channel:

    var channel = createChannel("req");
    channel.send(new Buffer("ping"), function(msg) {
      console.log("Response from remote: %s", msg);
    });


### Channel.attach(socket)

Attaches a valid `socket`. The `ParallSocket` must of correct type. 


### Channel.close()

The close method shall destroy all active socket connections. All outgoing
messages are dropped. All new incomming messages are ignored.


