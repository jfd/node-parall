


## Built-in functions (BIF's)

Parall comes with a set of built-in function. This functions is defined
globally and can be accessed from within any running Nodule.

### exit(reason, [ref])

Sends a exit signal to Nodule of `"ref"` with `"reason"`.

Function is defaulting to reference of calling Nodule if `"ref"` is
not set.

Exit signals can be trapped by specifying a nodule-flag. See section
nodule-flags.

#### Usage

    /* Spawn a new Nodule and put it in receive-mode, then kill it */
    $ var worker = spawn(function() { receive(); });
    $ exit("bye bye", worker);

    /* Exit calling Nodule. */
    $ exit("quiting");


### link(nodule)

Links calling `Nodule` with `"nodule"` Nodule. Returns `true` if link
was created, else `false`.

#### Usage

    $ var ref = spawn("./worker");
    $ link(ref);

### Notes

Returns `false` if `"nodule"` is calling `Nodule`.


### node([nodule])

If `"nodule"` is set, returns a reference to it's Node (process). Else, returns a reference to current running Node (a.k.a current running Process).

#### Usage

    $ node();
    <Node local>
    
    $ var worker = spawnNode("./worker");
    $ node(worker);
    <Node 1>

### receive(callbacks)

Puts current `nodule` in receive mode. The `nodule` is blocking
until a message has arrived.

#### Usage

     receive (
        function ping(sender) {
          send(sender, ["pong"]);
        }
     );



### register(regname, nodule)

Register `"nodule"` with `"regname"`. The `"regname"` works like an alias
and can be used in `send`, `exit`, `link`, `unlink` with friends.

#### Usage
      
      var worker = spawn("./worker");
      register("myworker", worker);
      send("myworker", ["ping"]);
      

### self()

Returns a reference to currently running `Nodule`. 

Returns `null` if not currently in a nodule-context.

#### Usage

    $ self();
    <Nodule 1@local>


### send(dest, msg)

Send's a message to `"dest"` nodule reference. The `"msg"` is
guaranteed to be delivered, as long as the nodule is running.

#### Usage

     /* Sends a message to self (current running Nodule) */
     $ send(self(), ["ping"]);
     true


### unlink(nodule)

Unlinks calling Nodule with relationship to `"nodule"` Nodule. Returns 
`true` if unlink was successful or `false` if no link was found.

#### Usage
    
    $ var ref = spawn("./worker");
    $ link(ref);
    $ unlink(ref);

### unregister(regname)

Unregister a previously `nodules` with `"regname"`.


### whereis(regname)

Return the Nodules `ref` associated with `"regname"` or `null` if not
registered.


## Module parall

### parall.sendAfter(dest, msg, delay)

### parall.startTimer(delay, dest, msg)

Starts a new timer for calling `Nodule`. The `"msg"` is sent to `"dest"` 
after `"delay"`.

Returns a `timerid`, which can be used to cancel the timer.

All started timers are automatically canceled when `Nodule` exits.

#### Usage

      $ var parall = require("parall");
      $ parall.startTimer(100, self(), ["ping"]);
      <TimerId 0x1234>


### parall.cancelTimer(timerid)

Cancel a timer of `"timerid"` started with `startTimer`. The function
returns `false` if `"timerid"` was invalid or already canceled, else
`true`.

#### Usage

      $ var parall = require("parall");
      $ var id = parall.startTimer(100, self(), ["ping"]);
      $ parall.endTimer(id);
      true
