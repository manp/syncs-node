"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
class Syncs {
    /**
     * @constructor
     * @param {string} path Syncs server path
     * @param {SyncsConfig} configs
     */
    constructor(path, configs = {}) {
        this.socketId = null;
        this.online = false;
        this.configs = {};
        this.onMessageListeners = [];
        this.handledClose = false;
        this.subscriptions = new Map();
        this.globalSharedObjects = new Map();
        this.groupSharedObjects = new Map();
        this.clientSharedObjects = new Map();
        this.rmiFunctions = {};
        this.rmiResultCallbacks = new Map();
        this.path = path;
        this.initializeConfigs(configs);
        if (this.configs.autoConnect) {
            this.connect();
        }
    }
    /**
     * initialize configuration with user inputs or default configurations
     * @param {SyncsConfig} configs
     */
    initializeConfigs(configs) {
        this.configs.autoConnect = configs.autoConnect == undefined ? true : configs.autoConnect;
        this.configs.autoReconnect = configs.autoReconnect == undefined ? true : configs.autoReconnect;
        this.configs.reconnectDelay = configs.reconnectDelay || 1000;
        this.configs.debug = configs.debug || false;
    }
    /**
     * enables debug mode
     */
    enableDebugMode() {
        this.configs.debug = true;
    }
    /**
     * disables debug mode
     */
    disableDebugMode() {
        this.configs.debug = false;
    }
    /**
     * connects to Syncs server
     */
    connect() {
        if (this.online) {
            return;
        }
        this.socket = new WebSocket(this.path);
        this.handleOnMessage();
        this.handleOnClose();
    }
    /**
     * handles incoming messages
     */
    handleOnMessage() {
        this.socket.addEventListener('message', (message) => {
            let parsedMessage = this.parseMessage(message.data);
            if (parsedMessage) {
                if (parsedMessage.command && parsedMessage.type) {
                    this.handleCommand(parsedMessage);
                }
                else {
                    for (let listener of this.onMessageListeners) {
                        listener(parsedMessage);
                    }
                }
            }
        });
    }
    /**
     * handle connection close
     */
    handleOnClose() {
        this.socket.addEventListener("error", () => { });
        this.socket.addEventListener('close', () => {
            this.online = false;
            if (this.handledClose || !this.configs.autoReconnect) {
                this.handledClose = false;
                if (this.onCloseListener) {
                    this.onCloseListener(this);
                }
            }
            else {
                if (this.onDisconnectListener) {
                    this.onDisconnectListener(this);
                }
                setTimeout(() => {
                    if (!this.online) {
                        this.connect();
                    }
                }, this.configs.reconnectDelay);
            }
        });
    }
    /**
     * disconnect from Syncs server
     */
    disconnect() {
        this.handledClose = true;
        this.socket.close();
    }
    /**
     * handle open event
     * open event will emit on first connection
     * @param { (server: Syncs) => {} } callback
     */
    onOpen(callback) {
        this.onOpenListener = callback;
    }
    /**
     * handle close event
     * this event will emit on close
     * @param { (server: Syncs) => {} } callback
     */
    onClose(callback) {
        this.onCloseListener = callback;
    }
    /**
     * handle disconnect event
     * this event will emit on unhandled close
     * @param { (server: Syncs) => {} } callback
     */
    onDisconnect(callback) {
        this.onDisconnectListener = callback;
    }
    /**
     * parse incoming message
     * returns parsed object or false if message is not valid
     * @param {string} message
     * @return {any|false}
     */
    parseMessage(message) {
        try {
            return JSON.parse(decodeURI(message));
        }
        catch (e) {
            return false;
        }
    }
    /**
     * handle incoming command
     * @param {any} command
     */
    handleCommand(command) {
        if (this.configs.debug) {
            console.log("\u2B07", 'INPUT COMMAND:', command);
        }
        switch (command.type) {
            case 'getSocketId':
                this.sendSocketId();
                if (this.socketId && this.onOpenListener) {
                    this.onOpenListener(this);
                }
                break;
            case 'setSocketId':
                this.socketId = command.socketId;
                this.online = true;
                if (this.onOpenListener) {
                    this.onOpenListener(this);
                }
                break;
            case 'event':
                this.handleEvent(command);
                break;
            case 'sync':
                this.handleSync(command);
                break;
            case 'rmi':
                this.handleRMICommand(command);
                break;
            case 'rmi-result':
                this.handleRmiResultCommand(command);
                break;
        }
    }
    /**
     * send socketId to Syncs server
     */
    sendSocketId() {
        if (this.socketId) {
            this.sendCommand({ type: 'reportSocketId', socketId: this.socketId });
            this.online = true;
        }
        else {
            this.sendCommand({ type: 'reportSocketId', socketId: null });
        }
    }
    /**
     * handle incoming message
     * @param { (message: any) => void } listener
     */
    onMessage(listener) {
        this.onMessageListeners.push(listener);
    }
    /**
     * send message to Syncs server
     * @param {any} message
     * @return {boolean}
     */
    send(message) {
        if (this.online) {
            this.socket.send(encodeURI(JSON.stringify(message)));
            return true;
        }
        return false;
    }
    /**
     * send message as syncs-command
     * @param {any} message
     * @return {boolean}
     */
    sendCommand(message) {
        try {
            message.command = true;
            if (this.configs.debug) {
                console.log("\u2B06", 'OUTPUT COMMAND:', message);
            }
            this.socket.send(encodeURI(JSON.stringify(message)));
            return true;
        }
        catch (e) {
            return false;
        }
    }
    /**************  EVENT LAYER ******************/
    /**
     * handle incomming event
     * @param {any} command
     */
    handleEvent(command) {
        if (command.event) {
            let subscription = this.subscriptions.get(command.event);
            if (subscription) {
                subscription.forEach((callback) => {
                    callback(command.data);
                });
            }
        }
    }
    /**
     * subscribe on incoming event
     * @param {string} event
     * @param { (data: any) => void } callback
     */
    subscribe(event, callback) {
        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
        }
        this.subscriptions.get(event).add(callback);
    }
    /**
     * un-subscribe from event
     * @param {string} event
     * @param {callback: (data: any) => void} callback
     */
    unSubscribe(event, callback) {
        if (!this.subscriptions.has(event)) {
            return;
        }
        this.subscriptions.get(event).delete(callback);
    }
    /**
     * publish an event to Syncs Server
     * @param {string} event
     * @param {any} data
     * @return {boolean}
     */
    publish(event, data) {
        return this.sendCommand({ type: 'event', event: event.toString(), data: data });
    }
    /**************  SHARED OBJECT LAYER ******************/
    /**
     * handle shared object sync command
     * @param command
     */
    handleSync(command) {
        switch (command.scope) {
            case 'GLOBAL':
                this.setGlobalSharedObject(command);
                break;
            case 'GROUP':
                this.setGroupSharedObject(command);
                break;
            case 'CLIENT':
                this.setClientSharedObject(command);
                break;
        }
    }
    /**
     * changes global shared object value
     * @param command
     */
    setGlobalSharedObject(command) {
        if (this.globalSharedObjects.has(command.name)) {
            this.globalSharedObjects.get(command.name).setProperties(command.values);
        }
        else {
            this.globalSharedObjects.set(command.name, SharedObject.globalLevel(command.name, {}, this));
        }
    }
    /**
     * changes group shared object value
     * @param command
     */
    setGroupSharedObject(command) {
        if (!this.groupSharedObjects.has(command.group)) {
            this.groupSharedObjects.set(command.group, new Map());
        }
        let group = this.groupSharedObjects.get(command.group);
        if (group.has(command.name)) {
            group.get(command.name).setProperties(command.values);
        }
        else {
            group.set(command.name, SharedObject.groupLevel(command.name, {}, this));
        }
    }
    /**
     * changes client shared object value
     * @param command
     */
    setClientSharedObject(command) {
        if (this.clientSharedObjects.has(command.name)) {
            this.clientSharedObjects.get(command.name).setProperties(command.values);
        }
        else {
            this.clientSharedObjects.set(command.name, SharedObject.clientLevel(command.name, {}, this));
        }
    }
    /**
     * returns client level shared object
     * @param {string} name
     * @return {any}
     */
    shared(name) {
        if (!this.clientSharedObjects.has(name)) {
            this.clientSharedObjects.set(name, SharedObject.clientLevel(name, {}, this));
        }
        return this.clientSharedObjects.get(name).data;
    }
    /**
     * return group level shared object
     * @param {string} group
     * @param {string} name
     * @return {any}
     */
    groupShared(group, name) {
        if (!this.groupSharedObjects.has(group)) {
            this.groupSharedObjects.set(group, new Map());
        }
        if (!this.groupSharedObjects.get(group).has(name)) {
            this.groupSharedObjects.get(group).set(name, SharedObject.groupLevel(name, {}, this));
        }
        return this.groupSharedObjects.get(group).get(name).data;
    }
    /**
     *
     * @param name
     * @return {any}
     */
    globalShared(name) {
        if (!this.globalSharedObjects.has(name)) {
            this.globalSharedObjects.set(name, SharedObject.globalLevel(name, {}, this));
        }
        return this.globalSharedObjects.get(name).data;
    }
    /**************  RMI LAYER ******************/
    /**
     * returns functions array
     * functions array is the place to initialize rmi functions
     * @return {any}
     */
    get functions() {
        if (!this.functionProxy) {
            this.functionProxy = new Proxy(this.rmiFunctions, {
                set: (target, property, value, receiver) => {
                    this.rmiFunctions[property] = value;
                    return true;
                }
            });
        }
        return this.functionProxy;
    }
    /**
     * handle incoming rmi command
     * @param {string} command
     */
    handleRMICommand(command) {
        if (command.name in this.functions) {
            let result = this.functions[command.name].call(this, ...command.args);
            if (result instanceof Promise) {
                result.then(promiseResult => {
                    this.sendRmiResultCommand(promiseResult, null, command.id);
                }).catch(error => {
                    this.sendRmiResultCommand(null, 'function error', command.id);
                });
            }
            else {
                this.sendRmiResultCommand(result, null, command.id);
            }
        }
        else {
            this.sendRmiResultCommand(null, 'undefined', command.id);
        }
    }
    /**
     * returns an remote functions object
     * remote functions object is the place to call remote functions
     * called method will return Promise to get result from remote
     * @return {any}
     */
    get remote() {
        return new Proxy({}, {
            get: (target, property, receiver) => this.onGetRemoteMethod(target, property, receiver)
        });
    }
    /**
     * handles proxy get for remote method invocation
     * @param target
     * @param property
     * @param receiver
     * @return {()=>Promise<T>}
     */
    onGetRemoteMethod(target, property, receiver) {
        let client = this;
        let id = this.generateRMIRequestUID();
        return function () {
            let args = [];
            for (let name in arguments) {
                args[name] = arguments[name];
            }
            client.sendRMICommand(property, args, id);
            return new Promise((resolve, reject) => {
                client.rmiResultCallbacks.set(id, [resolve, reject]);
            });
        };
    }
    /**
     * generates request id for RMI
     * @return {string}
     */
    generateRMIRequestUID() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    }
    /**
     * handles rmi-result command
     * @param command
     */
    handleRmiResultCommand(command) {
        let callbacks = this.rmiResultCallbacks.get(command.id);
        if (command.error) {
            callbacks[1].call(this, command.error);
        }
        else {
            callbacks[0].call(this, command.result);
        }
        this.rmiResultCallbacks.delete(command.id);
    }
    /**
     * sends rmi calling command to Syncs server;
     * @param {string} name
     * @param {any} args
     * @param {string} id
     */
    sendRMICommand(name, args, id) {
        this.sendCommand({
            type: "rmi",
            id: id,
            name: name,
            args: args
        });
    }
    /**
     * send rmi-result command to SyncsServer
     * @param result
     * @param error
     * @param id
     */
    sendRmiResultCommand(result, error, id) {
        this.sendCommand({
            type: "rmi-result",
            id: id,
            result: result,
            error: error
        });
    }
}
exports.Syncs = Syncs;
/**
 * Shared Object Class to create Shared Object functionality
 */
class SharedObject {
    constructor() {
        this.rawData = function (event) { };
        this.readOnly = true;
    }
    /**
     * creates a global level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static globalLevel(name, initializeData, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'GLOBAL';
        result.readOnly = true;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * creates group level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static groupLevel(name, initializeData = {}, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'GROUP';
        result.readOnly = true;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * creates client level synced object
     * @param name
     * @param initializeData
     * @param server
     * @return {SharedObject}
     */
    static clientLevel(name, initializeData = {}, server) {
        let result = new SharedObject();
        result.name = name;
        result.type = 'CLIENT';
        result.readOnly = false;
        result.rawData.data = initializeData;
        result.server = server;
        result.initialize();
        return result;
    }
    /**
     * initialize proxy object to observe changes in raw data
     */
    initialize() {
        this.proxy = new Proxy(function () {
        }, this.getHandler());
    }
    /**
     * returns handlers for proxy
     * @return {{get: ((target:any, property:any, receiver:any)=>any|string|number), set: ((target:any, property:any, value:any, receiver:any)=>boolean), apply: ((target:any, thisArg:any, argumentsList:any)=>any)}}
     */
    getHandler() {
        return {
            get: (target, property, receiver) => this.onGet(target, property, receiver),
            set: (target, property, value, receiver) => this.onSet(target, property, value, receiver),
            apply: (target, thisArg, argumentsList) => this.onApply(target, thisArg, argumentsList)
        };
    }
    onGet(target, property, receiver) {
        if (property in this.rawData.data) {
            return this.rawData.data[property];
        }
        return null;
    }
    onApply(target, thisArg, argumentsList) {
        if (argumentsList.length > 0) {
            this.onChangeHandler = argumentsList[0];
        }
        return this.proxy;
    }
    onSet(target, property, value, receiver) {
        if (this.readOnly) {
            return false;
        }
        this.rawData.data[property] = value;
        if (this.onChangeHandler) {
            let values = {};
            values[property] = value;
            this.onChangeHandler({ values: values, by: 'client' });
        }
        this.sendSyncCommand(property);
        return true;
    }
    /**
     * sends syncs command to Syncs Server
     * @param property
     */
    sendSyncCommand(property) {
        let command = {
            type: 'sync',
            name: this.name,
            scope: 'CLIENT',
            key: property,
            value: this.rawData.data[property]
        };
        this.server.sendCommand(command);
    }
    /**
     * returns abstracted shared object as a proxy
     * @return {any}
     */
    get data() {
        return this.proxy;
    }
    /**
     * apply changes from server to shared object
     * @param values
     */
    setProperties(values) {
        for (let key in values) {
            this.rawData.data[key] = values[key];
        }
        if (this.onChangeHandler) {
            this.onChangeHandler({ values: values, by: 'server' });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3luY3MuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzeW5jcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBLGdDQUFnQztBQUNoQztJQXNCSTs7OztPQUlHO0lBQ0gsWUFBWSxJQUFXLEVBQUMsVUFBb0IsRUFBRTtRQXZCdEMsYUFBUSxHQUFXLElBQUksQ0FBQztRQUN6QixXQUFNLEdBQVksS0FBSyxDQUFDO1FBRXZCLFlBQU8sR0FBZ0IsRUFBRSxDQUFDO1FBQzFCLHVCQUFrQixHQUFVLEVBQUUsQ0FBQztRQUMvQixpQkFBWSxHQUFHLEtBQUssQ0FBQztRQUNyQixrQkFBYSxHQUEwQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ2pFLHdCQUFtQixHQUE4QixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQzNELHVCQUFrQixHQUEyQyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3ZFLHdCQUFtQixHQUErQixJQUFJLEdBQUcsRUFBRSxDQUFDO1FBSzVELGlCQUFZLEdBQVEsRUFBRSxDQUFDO1FBQ3ZCLHVCQUFrQixHQUF1QyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBU3ZFLElBQUksQ0FBQyxJQUFJLEdBQUMsSUFBSSxDQUFDO1FBQ2YsSUFBSSxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLEVBQUUsQ0FBQSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUEsQ0FBQztZQUN6QixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDbkIsQ0FBQztJQUNMLENBQUM7SUFFRDs7O09BR0c7SUFDSyxpQkFBaUIsQ0FBQyxPQUFvQjtRQUMxQyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsR0FBRyxPQUFPLENBQUMsV0FBVyxJQUFFLFNBQVMsR0FBRyxJQUFJLEdBQUcsT0FBTyxDQUFDLFdBQVcsQ0FBQztRQUN2RixJQUFJLENBQUMsT0FBTyxDQUFDLGFBQWEsR0FBRyxPQUFPLENBQUMsYUFBYSxJQUFFLFNBQVMsR0FB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