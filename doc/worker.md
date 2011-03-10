
## Workers

Parall workers is the answer to "Actors", which is common in many other languages. The worker is based on the `child_process` module found in Node.js, but with one difference, workers can only be spawned from Javascript modules.

New Workers is created via the `spawn` function.

## spawn(module, [args], options...)

Creates a new `Worker` and starts it with provided arguments and options.

The `spawn` function scans all given arguments for "option arguments".

Available options are:

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
    
    // Spawn a new worker in "pipe"-mode.
    spawn("./worker", "pipe");


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

