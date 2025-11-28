const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoom, joinRoom, getRoom, addMessage, getRoomMessages, addClient, removeClient, getClientName } = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all for MVP, restrict in prod
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Secure Chat Server is running. Please use the frontend at http://localhost:3000');
});

// API to create a room
app.post('/api/create-room', (req, res) => {
    const { roomName } = req.body;
    if (!roomName) {
        return res.status(400).json({ error: 'Room name is required' });
    }
    const roomDetails = createRoom(roomName);
    res.json(roomDetails);
});

// API to join a room (validates passkey and returns keys)
app.post('/api/join-room', (req, res) => {
    const { roomId, passkey } = req.body;
    if (!roomId || !passkey) {
        return res.status(400).json({ error: 'Room ID and Passkey are required' });
    }

    const result = joinRoom(roomId, passkey);
    if (result.error) {
        return res.status(401).json(result);
    }

    res.json(result);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_room_socket', ({ roomId, nickname }) => {
        // The client should have already validated via API to get keys.
        // This socket event is just to subscribe to the channel.
        const room = getRoom(roomId);
        if (room) {
            socket.join(roomId);
            addClient(roomId, socket.id, nickname || 'Anonymous');
            console.log(`Socket ${socket.id} (${nickname}) joined room ${roomId}`);

            // Send existing message history
            const history = getRoomMessages(roomId);
            socket.emit('message_history', history);

            socket.to(roomId).emit('user_joined', { userId: socket.id, nickname: nickname || 'Anonymous' });
        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    socket.on('send_message', ({ roomId, message, sender, ttl }) => {
        // Message should be encrypted by client using Public Key
        // We just relay it.
        const room = getRoom(roomId);
        if (room) {
            const senderName = getClientName(roomId, sender);
            const messageData = {
                message, // Encrypted payload
                sender,
                senderName,
                timestamp: Date.now()
            };

            if (ttl) {
                messageData.expiresAt = Date.now() + (ttl * 1000);
                messageData.ttl = ttl; // Send back to client so they can show a timer or remove it locally
            }

            // Store message in history
            addMessage(roomId, messageData);

            // Broadcast to room
            io.to(roomId).emit('receive_message', messageData);
        }
    });

    socket.on('typing', ({ roomId }) => {
        const senderName = getClientName(roomId, socket.id);
        socket.to(roomId).emit('user_typing', { userId: socket.id, nickname: senderName });
    });

    socket.on('stop_typing', ({ roomId }) => {
        socket.to(roomId).emit('user_stop_typing', { userId: socket.id });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // We need to find which room they were in to notify others
        // Ideally we track this mapping, but for now we can iterate or just rely on socket.rooms if available before disconnect
        // But socket.rooms is cleared on disconnect.
        // We can iterate our rooms map.
        // For MVP, let's just rely on roomManager cleanup if we want strict tracking, 
        // but for "User Left" notification, we'd need to know the room.
        // Let's skip expensive iteration for now unless critical.
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
