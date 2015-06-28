/**************/
/*** CONFIG ***/
/**************/
var PORT = 8080;


/*************/
/*** SETUP ***/
/*************/
var express = require('express');
var http = require('http');
var main = express()
var server = http.createServer(main)
var io  = require('socket.io').listen(server);
var listChannels = require('./serverRooms.json');

server.listen(PORT, null, function() {
    console.log("Listening on port " + PORT);
});

main.get('/', function(req, res){ res.sendfile('client.html'); });
main.get('/index.html', function(req, res){ res.sendfile('client.html'); });
main.get('/client.html', function(req, res){ res.sendfile('client.html'); });
main.get('/adapter.js', function(req,res) { res.sendfile('adapter.js'); });



/*************************/
/*** INTERESTING STUFF ***/
/*************************/
var channels = ['Welcome room'];
var sockets = {};

/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
io.sockets.on('connection', function (socket) {
    socket.channels = {};
    sockets[socket.id] = socket;

    console.log("["+ socket.id + "] connection accepted");
    socket.on('disconnect', function () {
        for (var channel in socket.channels) {
            part(channel);
        }
        console.log("["+ socket.id + "] disconnected");
        delete sockets[socket.id];
    });

    socket.on('join', function (config) {
        console.log("["+ socket.id + "] join ", config);
        var channel = config.channel;
        var userdata = config.userdata;

        if (channel in socket.channels) {
            console.log("["+ socket.id + "] ERROR: already joined ", channel);
            return;
        }
        for(channel in socket.channels) {
            console.log("channel : "+channel);
            part(channel);
        }
        if (!(channel in channels)) {
            channels[channel] = {};
        }

        for (id in channels[channel]) {
            channels[channel][id].emit('addPeer', {'peer_id': socket.id, 'should_create_offer': false});
            socket.emit('addPeer', {'peer_id': id, 'should_create_offer': true});
        }

        channels[channel][socket.id] = socket;
        socket.channels[channel] = channel;
    });

    function part(channel) {
        console.log("["+ socket.id + "] part '"+channel+"'");
        if (!(channel in socket.channels)) {

            console.log("["+ socket.id + "] ERROR: not in ", channel);
            console.log("only in ");
            for(channel in socket.channels) {
                console.log(channel+" - ")
            }
            return;
        }

        delete socket.channels[channel];
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