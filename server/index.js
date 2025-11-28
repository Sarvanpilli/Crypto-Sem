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
    const { roomName, creatorPublicKey } = req.body;
    if (!roomName || !creatorPublicKey) {
        return res.status(400).json({ error: 'Room name and Creator Public Key are required' });
    }
    const roomDetails = createRoom(roomName, creatorPublicKey);
    res.json(roomDetails);
});

// API to join a room (validates passkey and returns creator's public key)
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

    // New User requesting to join
    socket.on('request_join', ({ roomId, publicKey, nickname }) => {
        const room = getRoom(roomId);
        if (room) {
            socket.join(roomId); // Join temporarily to receive approval

            // Notify the room (specifically the creator/others) that someone wants to join
            socket.to(roomId).emit('new_user_request', {
                socketId: socket.id,
                publicKey,
                nickname
            });
        }
    });

    // Existing member approves and sends wrapped key
    socket.on('approve_join', ({ targetSocketId, encryptedKey, roomId }) => {
        io.to(targetSocketId).emit('join_approved', {
            encryptedKey,
            roomId
        });
    });

    socket.on('join_room_socket', ({ roomId, nickname, publicKey }) => {
        const room = getRoom(roomId);
        if (room) {
            socket.join(roomId);
            addClient(roomId, socket.id, nickname || 'Anonymous', publicKey);
            console.log(`Socket ${socket.id} (${nickname}) joined room ${roomId}`);

            // Send existing message history
            const history = getRoomMessages(roomId);
            socket.emit('message_history', history);

            socket.to(roomId).emit('user_joined', { userId: socket.id, nickname: nickname || 'Anonymous' });
        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    socket.on('send_message', ({ roomId, message, sender, ttl, nonce }) => {
        const room = getRoom(roomId);
        if (room) {
            const senderName = getClientName(roomId, sender);
            const messageData = {
                message, // Encrypted payload (AES-GCM ciphertext)
                nonce,   // IV for AES-GCM
                sender,
                senderName,
                timestamp: Date.now()
            };

            if (ttl) {
                messageData.expiresAt = Date.now() + (ttl * 1000);
                messageData.ttl = ttl;
            }

            addMessage(roomId, messageData);
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
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
