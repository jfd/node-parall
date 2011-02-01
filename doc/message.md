# Message

### Message.handled

Indicates if message has been handled or not.



### Message.reject()

Rejects this message. The remote node should choose another 
endpoint to handle this message. 

Note: The reject function should be used for load-balancing purposes
      only. Use reject when current node is busy and not as a way
      to discard unwanted messages.


### Message.ok()

Replies to specified message with an OK answer.


### Message.send(response)

Replies to specified message with an answer. 

