var users = [];
var server = require('http').createServer();
var WebSocketServer = require('ws').Server;

var connections = {};
var registered  = {};

var connectionIDCounter = 0;

var port = 5800;

var wss = new WebSocketServer({server: server}, function(){
    console.log("Listening on port: " + port);
});

server.listen(port, "0.0.0.0", function(){
    console.log("Listening on port: " + port);
});

wss.on('connection', function(socket) {

    socket.id = connectionIDCounter ++;

    connections[socket.id] = socket;
    
    // registered[socket.id] = 'Guest' + socket.id;
    // sendMessage(socket.id, 'me', {nick: registered[socket.id], id: socket.id});

    connections[socket.id].position = {};
    connections[socket.id].position.x = 0;
    connections[socket.id].position.y = 1.8;
    connections[socket.id].position.z = 0;

    connections[socket.id].rotation = {};
    connections[socket.id].rotation.pitch = 0;
    connections[socket.id].rotation.yaw = 0;

    console.log('Connected: ' + socket.id);

    socket.on('message', function(message) {
        var resultObject = JSON.parse(message);

        parseMessage(this.id, resultObject);        
    });


    socket.on('close', function(message) {
        sendUserState(this.id, 'disconnected'); 

        var app = connections[this.id].app;
        
        delete registered[this.id];
        delete connections[this.id];         

        updateUsersList( app );
        console.log('Disconnected: ' + this.id);

    });

}); 

function updateUsersList( app ){
    var data = {};

    for (var id in connections) {

        if (connections[id].app == app) {        
            data[id] = {};
            data[id].position = {};
            data[id].rotation = {};
            data[id].vrState = {};

            data[id].position = connections[id].position;
            data[id].rotation = connections[id].rotation;
            data[id].vrState = connections[id].vrState;
        }
    }

    broadcastMessage('users', JSON.stringify({users: registered, user_data: data}), {}, app);    
}

function checkUserId(id){
    return !!connections[id];
}

function isRegistered(id){
    return !!registered[id];
}


function parseMessage(id, msg){
    switch (msg.type) {
        case 'position':
            if (!isRegistered(id)) return;

            connections[id].position.x = msg.data.x;
            connections[id].position.y = msg.data.y;
            connections[id].position.z = msg.data.z;
            
            console.log('User ' + registered[id] +  ' moved to: [x: ' + connections[id].position.x + ', y: ' + connections[id].position.y + ', z: ' + connections[id].position.z+']');

            sendUserState(id, 'moved');
        break;
        case 'rotation':
            if (!isRegistered(id)) return;

            if (msg.data.vrState) {
                connections[id].vrState = msg.data;
                console.log('User ' + registered[id] +  ' looking with a VR device.');
                sendUserState(id, 'rotated'); 
            } else {
                connections[id].rotation.pitch = msg.data.pitch;
                connections[id].rotation.yaw = msg.data.yaw;
                
                console.log('User ' + registered[id] +  ' looking at: [pitch: ' + connections[id].rotation.pitch + ', yaw: ' + connections[id].rotation.yaw +']');

                sendUserState(id, 'rotated');                
            }

        break;        
        case 'register':
            if (!checkUserId(id)) return;

            registered[id] = msg.data.nick;
            connections[id].app = msg.data.app;

            console.log(msg.data.app);

            console.log('User ' + id +  ' registered as: [' + registered[id] + '] from world "'+connections[id].app+'"');

            sendMessage(id, 'me', {nick: registered[id], id: id});
            
            sendUserState(id, 'connected');

            updateUsersList( msg.data.app );

        break;      
        case 'status':
            if (!checkUserId(id)) {
                sendMessage(id, 'status', 'registered');
            } else {
                sendMessage(id, 'status', 'not registered');
            }
        break;
        case 'users':
            if (!isRegistered(id)) return;

            updateUsersList( connections[id].app );
        break;
        case 'chat':
            if  (!isRegistered(id)) return;

            if (msg.data.type = "public"){
                console.log(registered[id] + ' yells: \"' + decodeURI(msg.data.text) +'\"');    

                broadcastMessage('chat', msg.data.text, connections[id], connections[id].app);
            } else {
                console.log(registered[id] + ' says \"' + decodeURI(msg.data.text) + '\" to ' + msg.data.to);
            }
        break;      
        case 'command':
            if  (!isRegistered(id)) return;

            console.log('Command requested: ' + msg.data.command + ' from ' + registered[id]);

            var command = msg.data.command;

            switch (command) {
                case 'msg': 

                    var params = msg.data.params;

                    console.log( params.join(' ') );

                    var to = params[0];
                    params = params.splice(1);
                    var text = params.join(' ');

                    if (!to) return;
                    if (!text || '' == text) return;

                    console.log(':: "' + text + '"" to ' + to);

                    for (var uid in connections) {
                        if (connections.hasOwnProperty(uid)) {
                            if (registered[uid] == to) {
                                sendMessage(uid, 'chat', text, connections[id]);
                                return;
                            }
                        }
                    }
                break;
                case 'logout':
                    connections[id].close(); 
                break;
            }
        break;      
    }
}

function broadcastMessage(type, message, sender, app)
{
    for (var id in connections) {
        if (connections.hasOwnProperty(id)) {
            // do stuff
            if (id !== sender.id || type=='users') {
                if (connections[id].app == app) {
                    sendMessage(id, type, message, sender, type=='users');
                }                
            }
        }
    }
}

function sendUserState(user_id, state, to)
{

    var msg = {
            type: 'user_state',
            id: user_id,
            nick: registered[user_id],
            status: state,
            position: {
                x: connections[user_id].position.x,
                y: connections[user_id].position.y,
                z: connections[user_id].position.z
            }, 
            rotation: {
                pitch: connections[user_id].rotation.pitch,
                yaw: connections[user_id].rotation.yaw,
            },
            vrState: connections[user_id].vrState 
        };

    var str = JSON.stringify(msg);

    if (to !== undefined){
        try{
            connections[to].send(str);
        } catch (ex){
            console.log(ex);
        }

        return;
    } 

    for (var id in connections) {
        if (''+user_id !== ''+id && connections[id].app === connections[user_id].app){
            try{
                connections[id].send(str);
            } catch (ex){
                console.log(ex);
            }
        }
    }
}

function sendMessage(id, type, message, from, force)
{
    var msg;

    if (!from)
        from = {};

    if (from.id !== undefined){

        if (from.id == id && !force) {
            return;
        }

        msg = {
            type: type,
            from: registered[from.id],
            text: message
        };
    } else {
        msg = {
            type: type,
            text: message
        };
    }

    try {
        connections[id].send(JSON.stringify(msg));
    } catch (ex) {
        delete connections[id];
        delete registered[this.id];
    }
}