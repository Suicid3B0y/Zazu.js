var PORT = 8080;

var express = require('express');
var http = require('http');
var sugar = require('sugar');
var main = express()
var server = http.createServer(main)
var io = require('socket.io').listen(server);
var fs = require('fs');

function fileExists(filePath) {
    try {
        return fs.statSync(filePath).isFile();
    } catch (err) {
        return false;
    }
}

var listChannels = null;
if (fileExists('./serverRooms.json')) {
    listChannels = require('./serverRooms.json');
} else {
    listChannels = require('./defaultRooms.json');
}

console.log(listChannels);
var DEFAULT_CHANNEL = listChannels[0].id;
server.listen(PORT, null, function () {
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

main.get('/', function (req, res) {
    res.sendFile('client.html', options);
});
main.get('/:source', function (req, res) {
    res.sendFile(req.params.source, options);
});
main.get('/css/:source', function (req, res) {
    res.sendFile("css/" + req.params.source, options);
});
main.get('/fonts/:source', function (req, res) {
    res.sendFile("fonts/" + req.params.source, options);
});
main.get('/js/:source', function (req, res) {
    res.sendFile("js/" + req.params.source, options);
});
main.get('/index.html', function (req, res) {
    res.sendFile('client.html', options);
});
main.get('/client.html', function (req, res) {
    res.sendFile('client.html', options);
});
main.get('/logo.html', function (req, res) {
    res.sendFile('logo.html', options);
});

var channels = listChannels;
var sockets = {};
var names = {};

io.sockets.on('connection', function (socket) {
    socket.channel = null;
    socket.name = (socket.handshake.query.name !== null && socket.handshake.query.name !== "") ? socket.handshake.query.name : "Noob user";
    socket.microphone_ok = socket.handshake.query.microphone_ok;
    sockets[socket.id] = socket;
    console.log("[" + socket.id + "] connection accepted");

    names[socket.id] = socket.name;

    for (id in sockets) {
        sockets[id].emit('listNames', names);
        sockets[id].emit("msgReceived", {code: "connect", author_id: socket.id, date: getTimestamp()})
    }

    function printChannels(channels) {
        var res = "";
        if (Array.isArray(channels)) {
            res += "[\n";
            for (var i = 0; i < channels.length; i++) {
                var tmp = Object.extended(channels[i]).clone(); // Obligé pour ne pas modifier le channel.sockets original
                tmp.sockets = [];
                if (i != channels.length-1) res += JSON.stringify(tmp)+",\n";
                else res += JSON.stringify(tmp)+"\n";
            }
            res += "]";
            return res;
        } else {
            res = "Error on argument channels :";
            res += channels.toString();
            return res;
        }

    }

    function saveRoomsToJson() {
        var outputJson = "serverRooms.json";
        fs.writeFile(outputJson, printChannels(channels), function(err) {
            if(err) {
              console.log(err);
            } else {
              console.log("JSON saved to " + outputJson);
            }
        });
    }

    function getTimestamp() {
        return parseInt(Date.now() / 1000, 10);
    }

    socket.on('disconnect', function () {
        part(socket.channel);
        console.log("[" + socket.id + "] disconnected");
        for (id in sockets)
            sockets[id].emit("msgReceived", {code: "disconnect", author_id: socket.id, date: getTimestamp()})
        delete sockets[socket.id];
        delete names[socket.id];
    });

    socket.on('changeName', function (name) {
        socket.name = name;
        names[socket.id] = name;
    })


    function join(channel) {
        console.log("[" + socket.id + "] try to join '" + channel + "'");
        if (channels[channel]) {
            if (channel === socket.channel) {
                console.log("[" + socket.id + "] ERROR: already joined " + channel);
                return;
            } else {
                if (socket.channel !== null) part(socket.channel);
                socket.channel = channel;
                console.log("[" + socket.id + "] joined '" + channel + "'");
                socket.emit('joinSuccess', channel);
                socket.emit('msgReceived', {code: "moveSelf", content: channels[channel].name, date: getTimestamp()});
            }

            for (id in channels[channel].sockets) {
                console.log(channels[channel].sockets[id]);
                sockets[channels[channel].sockets[id]].emit('addPeer', {
                    'peer_id': socket.id,
                    'should_create_offer': false
                });
                socket.emit('addPeer', {'peer_id': channels[channel].sockets[id], 'should_create_offer': true});
                sockets[channels[channel].sockets[id]].emit('msgReceived', {
                    code: "moveChannelIn",
                    author_id: socket.id,
                    date: getTimestamp()
                });
            }

            channels[channel].sockets.add(socket.id);
        } else {
            console.log("[" + socket.id + "] ERROR: channel '" + channel + "' doesn't exist");
        }
    }

    socket.on('join', join);

    function part(channel) {
        console.log("[" + socket.id + "] part '" + channel + "'");
        if (!(channel === socket.channel)) {

            console.log("[" + socket.id + "] ERROR: not in ", channel);
            console.log("only in " + socket.channel);
            return;
        }
        delete socket.channel;
        channels[channel].sockets.remove(socket.id);
        for (id in channels[channel].sockets) {
            sockets[channels[channel].sockets[id]].emit('removePeer', {'peer_id': socket.id});
            sockets[channels[channel].sockets[id]].emit('msgReceived', {
                code: "moveChannelOut",
                author_id: socket.id,
                date: getTimestamp()
            });
        }
    }

    socket.on('part', part);

    socket.on('msgSent', function (msg) {
        switch (msg.code) {
            case "channel":
                console.log("[" + socket.id + "] send '" + encodeURI(msg.content) + "' to '" + socket.channel + "'");
                for (id in channels[socket.channel].sockets) {
                    sockets[channels[socket.channel].sockets[id]].emit('msgReceived', {
                        'code': 'channel',
                        'content': msg.content,
                        'author_id': socket.id,
                        'date': getTimestamp()
                    })
                }
                break;
            case "channelDistant":
                console.log("[" + socket.id + "] send '" + encodeURI(msg.content) + "' to '" + channels[msg.id].name + "'");
                for (id in channels[msg.id].sockets) {
                    sockets[channels[msg.id].sockets[id]].emit('msgReceived', {
                        'code': 'channel',
                        'content': msg.content,
                        'author_id': socket.id,
                        'date': getTimestamp()
                    });
                }
                if (channels[msg.id].sockets.indexOf(socket.id) == -1) {
                    socket.emit('msgReceived', {
                        'code': 'channelOut',
                        'content': msg.content,
                        'channel': msg.id,
                        'date': getTimestamp()
                    })
                }
                break;
            case "private":
                console.log("[" + socket.id + "] send '" + encodeURI(msg.content) + "' to [" + msg.receiver_id + "]");
                if (sockets[msg.receiver_id]) {
                    sockets[msg.receiver_id].emit('msgReceived', {
                        'code': 'privateIn',
                        'content': msg.content,
                        'author_id': socket.id,
                        'date': getTimestamp()
                    });
                    socket.emit('msgReceived', {
                        'code': 'privateOut',
                        'content': msg.content,
                        'receiver_id': msg.receiver_id,
                        'date': getTimestamp()
                    });
                } else {
                    console.log("[" + socket.id + "] can't find the receiver [" + msg.receiver_id + "]");
                }
                break;
        }
    });

    socket.on('editNameChannel', function (channel) {
        console.log("[" + socket.id + "] change name of channel of id '" + channel.id + "' from '" + channels[channel.id].name + "'' to '" + channel.name + "'");
        channels[channel.id].name = channel.name;

        saveRoomsToJson(); 
    });

    socket.on('addChannel', function(channel) {
        console.log("[" + socket.id + "] add a channel '" + channel.name + "' in channel '" + channels[channel.father].name + "'");
        newChannelId = channels.max(function(n) { return n.id }).id+1;
        channels.add({"id":newChannelId,"name":channel.name,"sockets":[],"father":channel.father});

        saveRoomsToJson();
    });

    socket.on('getListChannelsAndNames', function () {
        socket.emit('listNames', names);
        socket.emit('listChannels', channels);
    });

    join(DEFAULT_CHANNEL);
    //listChannelsInterval = setInterval(sendListChannels, 1000);

    socket.on('muted', function () {
        for (peer in sockets) {
            sockets[peer].emit('muted', {'peer_id': socket.id});
        }
    })

    socket.on('unmuted', function () {
        for (peer in sockets) {
            sockets[peer].emit('unmuted', {'peer_id': socket.id});
        }
    })

    socket.on('deafen', function() {
        for (peer in sockets) {
            sockets[peer].emit('deafen', {'peer_id': socket.id});
        }
    })

    socket.on('undeafen', function() {
        for (peer in sockets) {
            sockets[peer].emit('undeafen', {'peer_id': socket.id});
        }
    })

    socket.on('relayICECandidate', function (config) {
        var peer_id = config.peer_id;
        var ice_candidate = config.ice_candidate;
        console.log("[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ", ice_candidate);

        if (peer_id in sockets) {
            sockets[peer_id].emit('iceCandidate', {'peer_id': socket.id, 'ice_candidate': ice_candidate});
        }
    });

    socket.on('relaySessionDescription', function (config) {
        var peer_id = config.peer_id;
        var session_description = config.session_description;
        console.log("[" + socket.id + "] relaying session description to [" + peer_id + "] ", session_description);

        if (peer_id in sockets) {
            sockets[peer_id].emit('sessionDescription', {
                'peer_id': socket.id,
                'session_description': session_description
            });
        }
    });
});
