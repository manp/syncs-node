# syncs-browser
__A JavaScript Library for Real-Time Web Applications__

_syncs-node_ is NodeJs module to work with [Syncs](https://github.com/manp/syncs). 


## Initalization 
_syncs-node_ is easy to setup.

```bash
  npm i syncs-node -S
```
Syncs classes are generated using TypeScript. TypeScript files are also published in npm package, so developers can write both server and client application using typescript.

JavaScript Initialize:
```javascript
  let Syncs=require('syncs-node').Syncs;
  let io=new Syncs("ws//server-addserss/syncs");
```

TypeScrip Initialize using default export:
```javascript
  import syncs from "syncs-node";
  let io=syncs("ws//server-addserss/syncs");
```
TypeScrip Initialize using Syncs class:
```javascript
  import {Syncs} from "syncs-node";
  let io=new Syncs("ws//server-addserss/syncs");
```

The path parameter is required that determines Syncs server address.
The second parameter is Syncs configs object with following properties:
+ `autoConnect:boolean`: If `autoConnect` is `false` then the Syncs instance will not connect to server on creation. To connect manuly to server developers should call `io.connect()` method. default value is `true`.
+ `autoReconnect:boolean`: This config makes the connection presistent on connection drop. default value is `true`.
+ `reconnectDelay: number`: time to wait befor each reconnecting try. default value is `10000`.
+ `debug:bolean`: This parameter enables debug mode on client side. default value is `false`.



## Handling connection
Syncs client script can automatically connect to Syncs server. If `autoConnect` config is set to `false`, the developer should connect manualy to server using `connect` method.

Using `connect` method developers can connect to defined server.

```typescript
  io.connect();
```

Target application can establish connection or disconnect from server using provided methods.
```typescript
  io.disconnect()
```

Developers can handle _disconnect_ and _close_ event with `onDisconnect` and `onClose`  method.
```typescript
    io.onDisconnect(()=>{
            
    })
```
```typescript
    io.onClose(()=>{
            
    })
```

It's alos possible to check connection status using `online` property of Syncs instance.
```typescript
  if(io.online){
      //do semething
  }
```



## Abstraction Layers

Syncs provides four abstraction layer over its real-time functionality for developers.


### 1. onMessage Abstraction Layer

Developers can send messages using `send` method of `Syncs` instance to send `JSON` message to the server.Also all incoming messages are catchable using `onMessage`.

```typescript
io.onConnection(client=>{
    io.send({text:"im ready"});
})
```
```typescript
io.onMessage(message=>{
    alert(message.text);
})
```


### 2. Publish and Subscribe Abstraction Layer
 With a Publish and Subscribe solution developers normally subscribe to data using a string identifier. This is normally called a Channel, Topic or Subject.
 
 ```typescript
  io.publish('mouse-move-event',{x:xLocation,y:yLocation});
 ```
 ```javascript
  io.subscribe('weather-update',updates=>{
    // update weather view
  });
 ```
 
  ### 3. Shared Data Abstraction Layer
Syncs provides Shared Data functionality in form of variable sharing. Shared variables can be accessible in tree level: _Global Level_, _Group Level_ and _Client Level_. Only _Client Level_ shared data can be write able with client.

To get _Client Level_ shared object use `shared` method of `Syncs` instance.
```typescript 
  let info=io.shared('info');
  info.title="Syncs is cool!"
```
To get _Group Level_ shared object use `groupShared` method of `Syncs` instance. First parameter is group name and second one is shared object name.

```typescript 
  let info=io.groupShared('vips','info');
  document.title=info.onlineUsers+" vip member are online";
```

To get _Global Level_ shared object use `globalShared` method of `Syncs` instance.
```typescript 
  let settings=io.globalShared('settings');
  applyBackground(settings.background);
```


It's possible to watch changes in shared object by using shared object as a function.
```typescript
  info((event)=>{
    document.title=info.title
  });
```
The callback function has two argument.
+ `values:object`: an object that contains names of changed properties and new values.
+ `by:string` a string variable with two value ( `'server'` and `'client'`) which shows who changed these properties.



### 4. Remote Method Invocation (RMI) Abstraction Layer
With help of RMI developers can call and pass argument to remote function and make it easy to develop robust and web developed application. RMI may abstract things away too much and developers might forget that they are making calls _over the wire_.

Before calling remote method from server ,developer should declare the function on client script.

`functions` object in `Syncs` instance is the place to declare functions.

```typescript
io.functions.showMessage=function(message) {
  alert(message);
}
```

To call remote method on server use `remote` object.

```typescript
  io.remote.setLocation(latitude,longitude)
```



The remote side can return a result (direct value or Promise object) which is accessible using `Promise` object returned by caller side.


```typescript
    io.functions.askName=function(title){
        return prompt(title);
    }
```
```typescript
io.functions.startQuiz=function(questions,quizTime){
    return new Promise((res,rej)=>{
        // start quiz
        setTimeout(()=>{
            res(quizResult);
        },quizTime);

    })
}
```

```typescript
  io.remote.getWeather(cityName).then(forcast=>{
      // show forcast result
  })
```
