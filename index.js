//
//  index.js
//  dota2spectator
//
//  Created by Roger (betterservant@gmail.com) on 07/27/15.
//  Copyright (c) 2015 betterservant.com. All rights reserved.
//
//  Description: 
//
var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    path = require('path'),
    ProtoBuf = require('protobufjs'),
    //bignumber = require('bignumber.js'),
    //you may need bignumber to support the 64bit steam id if your computer doesn't
    Dota = exports;

var debuglog = function debuglog(foo,foodes){
	if (this.debug){
        if(foodes){
		    util.log(foodes+': ');
	    }
	    if (typeof foo == 'object') {
		    util.log(util.inspect(foo, false, null));
	    }else {
		    util.log(foo);
	    }
    }
}
//require('util').inherits(Dota2, EventEmitter);

var builder = ProtoBuf.newBuilder();
builder = ProtoBuf.loadProtoFile(path.join(__dirname, '/resources/protobufs/dota/dota_gcmessages_client.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, '/resources/protobufs/dota/gcsdk_gcmessages.proto'), builder);
ProtoBuf.loadProtoFile(path.join(__dirname, '/resources/protobufs/dota/gcsystemmsgs.proto'), builder);
var Dota2 = builder.build();


Dota2._processProto = function(proto) {
    proto = proto.toRaw(false, true);
    for (var field in proto){
        if (proto[field] == null) {
            delete proto[field];
        }
    }
    return proto;
}

var Dota2Client = function Dota2Client(user, gc, debug) {
    EventEmitter.call(this);

    this.debug = debug;
    this._client = user._client;
    this._user = user;
    this._gc = gc;
    this._appid = gc._appid || 570;
    this._gcReady = false;
    this._gcClientHelloIntervalId = null;
    this._gcConnectionStatus = Dota2.GCConnectionStatus.GCConnectionStatus_NO_SESSION;

    var self = this;
    debuglog(self._handlers, 'self._handlers');
    
    this._gc.on('message', function(header, body, callback) {
        debuglog('received gc message: '+header.msg);
        debuglog(body,'body');
        if (header.msg in self._handlers){
            debuglog('received dota2 message: '+header.msg);
            handlers[header.msg].call(this, body, callback);
        }else {
            this.emit('unhandled', header, body, callback);
        }
    }.bind(this));
    
    this._sendClientHello = function(){
        if(self._gcReady){
            if(self._gcClientHelloIntervalId){
                clearInterval(self._gcClientHelloIntervalId);
                self._gcClientHelloIntervalId = null;
            }
            return;
        }
        if(self._gcClientHelloCount > 10){
            console.log('ClientHello has taken longer than 30 seconds! Reporting timeout...');
            self._gcClientHelloCount = 0;
            self.emit("hellotimeout");
        }
        debuglog('Sending ClientHello');
        if(!self._gc){
            console.log('Where the fuck is _gc');
        }else {
            self._gc.send({
                msg: Dota2.EGCBaseClientMsg.k_EMsgGCClientHello,
                proto: { }},
                new Dota2.CMsgClientHello().toBuffer());
        }
        self._gcClientHelloCount++;
    }
   
}

util.inherits(Dota2Client, EventEmitter);

//Dota2._handlers = {};
Dota2Client.methods = {};
Dota2Client.events = {};
//util.log(Dota2);
//console.log('_____________________________________________________________');

//require('./resources/messages');

//Expose enums
Dota2Client.prototype.ServerRegion = Dota2.ServerRegion;
Dota2Client.prototype.GameMode = Dota2.GameMode;

//util.log(Dota2);
//methods
Dota2Client.prototype.ToAccountID = function(steamid){
    return steamid - 76561197960265728;
    //return new bignumber(steamid).minus('76561197960265728')-0;
}

Dota2Client.prototype.ToSteamID = function(accid){
    return accid+76561197960265728;
    //return new bignumber(accid).plus('76561197960265728')+"";
}

Dota2Client.prototype.launch = function(){
    util.log('Lauching Dota 2');
    this.AccountID = this.ToAccountID(this._client.steamID);
    this.Party = null;
    this.Lobby = null;
    this.PartyInvite = null;
    this._user.gamesPlayed([{'game_id': this._appid}]);
    this._gcClientHelloCount = 0;
    this._gcClientHelloIntervalId = setInterval(this._sendClientHello, 6000);
    setTimeout(this._sendClientHello, 1000);
}

Dota2Client.prototype.exit = function() {
  /* Reports to Steam we are not running any apps. */
  util.log("Exiting Dota 2");

  /* stop knocking if exit comes before ready event */
  if (this._gcClientHelloIntervalId) {
      clearInterval(this._gcClientHelloIntervalId);
      this._gcClientHelloIntervalId = null;
  }
  this._gcReady = false;
  
  if(this._client.loggedOn) {
  	this._user.gamesPlayed([]);
    console.log('Exited Dota2, Goodby!');
  }
}

/*
Dota2Client.prototype.findTopSourceTVGames = function(filterOptions, callback) {
    callback = callback || null;
    debuglog('sending league search request');
    this._gc.send({
        msg:  Dota2.EDOTAGCMsg.k_EMsgGCFindSourceTVGames,
        proto: {}
    },
    new Dota2.CMsgFindSourceTVGames(filterOptions).toBuffer(),
    callback);
};
*/


//handlers
var handlers = Dota2Client.prototype._handlers = {};


/*
handlers[Dota2.EDOTAGCMsg.k_EMsgGCSourceTVGamesResponse] = function onGCToClientFindTopSourceTVGamesResponse(message, callback) {
    callback = callback || null;
    var topSourceTVGamesResponse = Dota2.CMsgGCToClientFindTopSourceTVGamesResponse.parse(message);
    if (typeof sourceTVGamesResponse.games != 'undefined' && topSourceTVGamesResponse.games.length > 0) {
        debuglog('Received topSourceTV games data');
        if (callback) callback(topSourceTVGamesResponse);
    }else {
        debuglog('Received a bad SourceTV games response');
        if (callback) callback(topSourceTVGamesResponse.result, topSourceTVGamesResponse);
    }
};
*/


handlers[Dota2.EGCBaseClientMsg.k_EMsgGCClientWelcome] = function clientWelcomeHandler(message) {
  /* Response to our k_EMsgGCClientHello, now we can execute other GC commands. */

  // Only execute if _gcClientHelloIntervalID, otherwise it's already been handled (and we don't want to emit multiple 'ready');
  if (this._gcClientHelloIntervalId) {
    clearInterval(this._gcClientHelloIntervalId);
    this._gcClientHelloIntervalId = null;
  }

  util.log("Received client welcome.");

  // Parse any caches
  this._gcReady = true;
  //this._handleWelcomeCaches(message);
  this.emit("clientWelcome", message);
};

handlers[Dota2.EGCBaseClientMsg.k_EMsgGCClientConnectionStatus] = function gcClientConnectionStatus(message) {
  /* Catch and handle changes in connection status, cuz reasons u know. */

  var status = Dota2.CMsgConnectionStatus.decode(message).status;
  util.log(util.inspect(message, false, null));
  var status = message.status;
  if(status) this._gcConnectionStatus = status;

  switch (status) {
    case Dota2.GCConnectionStatus.GCConnectionStatus_HAVE_SESSION:
      if (this.debug) util.log("GC Connection Status regained.");

      // Only execute if _gcClientHelloIntervalID, otherwise it's already been handled (and we don't want to emit multiple 'ready');
      if (this._gcClientHelloIntervalId) {
        clearInterval(this._gcClientHelloIntervalId);
        this._gcClientHelloIntervalId = null;

        this._gcReady = true;
        this.emit("ready");
      }
      break;

    default:
      if (this.debug) util.log("GC Connection Status unreliable - " + status);

      // Only execute if !_gcClientHelloIntervalID, otherwise it's already been handled (and we don't want to emit multiple 'unready');
      if (!this._gcClientHelloIntervalId) {
        this._gcClientHelloIntervalId = setInterval(this._sendClientHello, 5000); // Continually try regain GC session

        this._gcReady = false;
        this.emit("unready");
      }
      break;
  }
}


Dota.Dota2Client = Dota2Client;

Dota.Dota2 = Dota2;
Dota.debuglog = debuglog;

require('./handlers/sourcetv')
