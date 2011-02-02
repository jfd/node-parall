
## Workers





## spawn(module, ...)

Creates a new `Worker` and starts it with provided arguments.

The `spawn` function scans all given arguments for "option arguments".

This options are:

- `'join'`. Joins the process, which means that the parent process
  exit's when new child process exit's. The parent process exits with 
  same exit code.
- `'pipe'`. Pipe workers `stdout` to current process `stdout`.
- `'noerror'`. Do not emit `error` on error.
- `'keepalive'`. Restarts the process on exit. Worker emits the `restart`
  event on each restart.
- `'deamon'`. Start the worker in deamon-mode.

Example:

    const spawn = require("parall").spawn;
    
    // Spawn a new worker in "silent"-mode.
    spawn("./worker", "silent");


## Worker

The Worker class.



### Worker.kill(signal='SIGTERM')

Send a signal to the process. If no argument is given, the process 
will be sent 'SIGTERM'. See signal(7) for a list of available signals.

    const spawn = require('parall').spawn;
    
    var p = spawn("./worker");

    p.kill("SIGHUP")

Note that while the function is called kill, the signal delivered to the 
child process may not actually kill it. kill really just sends a signal 
to a process.

See kill(2)

