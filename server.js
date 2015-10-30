var PORT = 8080;

var express = require('express');
var http = require('http');
var sugar = require('sugar');
var main = express()
var server = http.createServer(main)
var io  = require('socket.io').listen(server);
var listChannels = require('./serverRooms.json');

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

var channels = listChannels;
var sockets = {};

io.sockets.on('connection', function (socket) {
    socket.channel = "Welcome room";
    sockets[socket.id] = socket;

    console.log("["+ socket.id + "] connection accepted");
    socket.on('disconnect', function () {
        part(socket.channel);
        console.log("["+ socket.id + "] disconnected");
        delete sockets[socket.id];
    });

    socket.on('join', function (config) {
        console.log("["+ socket.id + "] join ", config);
        var channel = decodeURI(config.channel);
        var userdata = config.userdata;
        if(channels[channel]) {
            if (channel === socket.channel) {
                console.log("["+ socket.id + "] ERROR: already joined "+channel);
                return;
            } else {
                part(socket.channel);
                socket.channel = channel;
                console.log("["+ socket.id + "] joined '"+channel+"'");
            }

            for (id in channels[channel]) {
                channels[channel][id].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false});
                socket.emit('addPeer', {'peer_id': id, 'should_create_offer': true});
            }

            channels[channel][socket.id] = socket;
        } else {
            console.log("["+ socket.id + "] ERROR: channel '"+ channel+ "' doesn't exist");
        }
    });

    function part(channel) {
        console.log("["+ socket.id + "] part '"+channel+"'");
        console.log(channels[channel]);
        if (!(channel===socket.channel.id)) {

            console.log("["+ socket.id + "] ERROR: not in ", channel);
            console.log("only in "+socket.channel);
            return;
        }
        delete socket.channel;
        delete channels[channel][socket.id];
        for (id in channels[channel]) {
            channels[channel][id].emit('removePeer', {'peer_id': socket.id});
            socket.emit('removePeer', {'peer_id': id});
        }
    }
    socket.on('part', part);

    socket.on('getListChannels', function() {
        socket.emit('listChannels', listChannels);
    });
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