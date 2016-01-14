var PORT = 8080;

var express = require('express');
var http = require('http');
var sugar = require('sugar');
var main = express()
var server = http.createServer(main)
var io  = require('socket.io').listen(server);
var listChannels = require('./serverRooms.json');
console.log(listChannels);
var DEFAULT_CHANNEL = listChannels[0].id;
server.listen(PORT, null, function() {
    console.log("Listening on port " + PORT);
});

var options = {
    root: __dirname + '/',
    dotfiles: 'deny',
    headers: {
        'x-timestamp': Date.now(),
        'x-sent': true
    }
  };

main.get('/', function(req, res){ res.sendFile('client.html', options); });
main.get('/index.html', function(req, res){ res.sendFile('client.html', options); });
main.get('/client.html', function(req, res){ res.sendFile('client.html', options); });
main.get('/adapter.js', function(req,res) { res.sendFile('adapter.js', options); });
main.get('/bootstrap.css', function(req,res) { res.sendFile('bootstrap.css', options); });

var channels = listChannels;
var sockets = {};
var names = {};

io.sockets.on('connection', function (socket) {
    socket.channel = null;
    socket.name = (socket.handshake.query.name!==null)? socket.handshake.query.name : "Noob user";
    sockets[socket.id] = socket;
    console.log("["+ socket.id + "] connection accepted");
    
    names[socket.id] = socket.name;

    for (id in sockets) {
        sockets[id].emit('listNames', names);
        sockets[id].emit("msgReceived", {code:"connect", author_id:socket.id, date: getTimestamp()})
    }


    function getTimestamp() {
        return parseInt(Date.now()/1000,10);
    }

    socket.on('disconnect', function () {
        part(socket.channel);
        console.log("["+ socket.id + "] disconnected");
        for (id in sockets)
            sockets[id].emit("msgReceived", {code:"disconnect", author_id:socket.id, date: getTimestamp()})
        delete sockets[socket.id];
        delete names[socket.id];
    });

    socket.on('changeName', function(name) {
        socket.name = name;
        names[socket.id] = name;
    })


    function join(channel) {
        console.log("["+ socket.id + "] try to join '"+channel+"'");
        if(channels[channel]) {
            if (channel === socket.channel) {
                console.log("["+ socket.id + "] ERROR: already joined "+channel);
                return;
            } else {
                if (socket.channel!==null) part(socket.channel);
                socket.channel = channel;
                console.log("["+ socket.id + "] joined '"+channel+"'");
                socket.emit('joinSuccess', channel);
            }

            for (id in channels[channel].sockets) {
                console.log(channels[channel].sockets[id]);
                sockets[channels[channel].sockets[id]].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false});
                socket.emit('addPeer', {'peer_id': channels[channel].sockets[id], 'should_create_offer': true});
                sockets[channels[channel].sockets[id]].emit('msgReceived', {code:"moveChannelIn", author_id:socket.id, date: getTimestamp()});
            }

            channels[channel].sockets.add(socket.id);
        } else {
            console.log("["+ socket.id + "] ERROR: channel '"+ channel+ "' doesn't exist");
        }
    }

    socket.on('join', join);

    function part(channel) {
        console.log("["+ socket.id + "] part '"+channel+"'");
        if (!(channel===socket.channel)) {

            console.log("["+ socket.id + "] ERROR: not in ", channel);
            console.log("only in "+socket.channel);
            return;
        }
        delete socket.channel;
        channels[channel].sockets.remove(socket.id);
        for (id in channels[channel].sockets) {
            sockets[channels[channel].sockets[id]].emit('removePeer', {'peer_id': socket.id});
            sockets[channels[channel].sockets[id]].emit('msgReceived', {code:"moveChannelOut", author_id:socket.id, date: getTimestamp()});
        }
    }
    socket.on('part', part);

    socket.on('msgSent', function(msg) {
        console.log("["+ socket.id + "] send '"+encodeURI(msg.content)+"' to '"+socket.channel+"'");
        switch (msg.code) {
            case "channel":
                for (id in channels[socket.channel].sockets) {
                    sockets[channels[socket.channel].sockets[id]].emit('msgReceived', {'code':'channel', 'content':msg.content, 'author_id': socket.id, 'date': getTimestamp()})
                }
                break;
            case "private":
                if (sockets[msg.receiver]) {
                    sockets[msg.receiver].emit('msgReceived', {'code':'privateIn', 'content':msg.content, 'author_id': socket.id, 'date': getTimestamp()});
                    socket.id.emit('msgReceived', {'code':'privateOut', 'content':msg.content, 'received_id': socket.id, 'date': getTimestamp()});
                }
                break;
        }
    });

    socket.on('getListChannelsAndNames', function() {
        socket.emit('listNames', names);
        socket.emit('listChannels', channels);
    });

    join(DEFAULT_CHANNEL);
    //listChannelsInterval = setInterval(sendListChannels, 1000);

    socket.on('muted', function() {
        for(peer in sockets) {
            sockets[peer].emit('muted', {'peer_id':socket.id});
        }
    })

    socket.on('unmuted', function() {
        for(peer in sockets) {
            sockets[peer].emit('unmuted', {'peer_id':socket.id});
        }
    })

    socket.on('relayICECandidate', function(config) {
        var peer_id = config.peer_id;
        var ice_candidate = config.ice_candidate;
        console.log("["+ socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

        if (peer_id in sockets) {
            sockets[peer_id].emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });

    socket.on('relaySessionDescription', function(config) {
        var peer_id = config.peer_id;
        var session_description = config.session_description;
        console.log("["+ socket.id + "] relaying session description to [" + peer_id + "] ", session_description);

        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription', {'peer_id': socket.id, 'session_description': session_description});
        }
    });
});