const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createRoom, joinRoom, getRoom } = require('./roomManager');

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

    socket.on('join_room_socket', ({ roomId }) => {
        // The client should have already validated via API to get keys.
        // This socket event is just to subscribe to the channel.
        const room = getRoom(roomId);
        if (room) {
            socket.join(roomId);
            console.log(`Socket ${socket.id} joined room ${roomId}`);
            socket.to(roomId).emit('user_joined', { userId: socket.id });
        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    socket.on('send_message', ({ roomId, message, sender }) => {
        // Message should be encrypted by client using Public Key
        // We just relay it.
        const room = getRoom(roomId);
        if (room) {
            // Broadcast to everyone in the room INCLUDING sender (so they see it confirmed)
            // Or typically exclude sender. Let's exclude sender for efficiency if they handle their own UI.
            // But usually sender wants to know it arrived.
            // Let's broadcast to room.
            io.to(roomId).emit('receive_message', {
                message, // Encrypted payload
                sender,
                timestamp: Date.now()
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
