const { v4: uuidv4 } = require('uuid');
const NodeRSA = require('node-rsa');

const rooms = new Map();

// Room lifetime in milliseconds (e.g., 1 hour)
const ROOM_LIFETIME = 60 * 60 * 1000;

function createRoom(roomName) {
    const roomId = uuidv4();
    const passkey = uuidv4().slice(0, 6).toUpperCase(); // Simple 6-char passkey

    // Generate RSA keys
    const key = new NodeRSA({ b: 2048 }); // 2048 bits for better security
    const publicKey = key.exportKey('pkcs1-public');
    const privateKey = key.exportKey('pkcs1-private');

    const room = {
        id: roomId,
        name: roomName,
        passkey,
        publicKey,
        privateKey,
        createdAt: Date.now(),
        expiresAt: Date.now() + ROOM_LIFETIME,
        clients: new Map(), // Map<socketId, { nickname }>
        messages: [] // Store encrypted messages
    };

    rooms.set(roomId, room);

    // Schedule cleanup
    setTimeout(() => {
        if (rooms.has(roomId)) {
            console.log(`Room ${roomId} expired.`);
            rooms.delete(roomId);
        }
    }, ROOM_LIFETIME);

    return {
        roomId,
        passkey,
        publicKey
    };
}

function joinRoom(roomId, passkey) {
    const room = rooms.get(roomId);

    if (!room) {
        return { error: 'Room not found or expired' };
    }

    if (room.passkey !== passkey) {
        return { error: 'Invalid passkey' };
    }

    // Return the private key so the client can decrypt messages
    return {
        success: true,
        roomName: room.name,
        publicKey: room.publicKey,
        privateKey: room.privateKey
    };
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function addClient(roomId, socketId, nickname) {
    const room = rooms.get(roomId);
    if (room) {
        room.clients.set(socketId, { nickname });
        return room.clients.size;
    }
    return 0;
}

function removeClient(roomId, socketId) {
    const room = rooms.get(roomId);
    if (room) {
        room.clients.delete(socketId);
        return room.clients.size;
    }
    return 0;
}

function getClientName(roomId, socketId) {
    const room = rooms.get(roomId);
    if (room && room.clients.has(socketId)) {
        return room.clients.get(socketId).nickname;
    }
    return 'Unknown';
}

function addMessage(roomId, messageData) {
    const room = rooms.get(roomId);
    if (room) {
        room.messages.push(messageData);
        // Optional: Limit history size (e.g., last 100 messages)
        if (room.messages.length > 100) {
            room.messages.shift();
        }
    }
}

function getRoomMessages(roomId) {
    const room = rooms.get(roomId);
    if (!room) return [];

    const now = Date.now();
    // Filter out expired messages
    room.messages = room.messages.filter(msg => !msg.expiresAt || msg.expiresAt > now);
    return room.messages;
}

// Global cleanup interval for messages (runs every 10 seconds)
setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms) {
        if (room.messages.length > 0) {
            const initialLength = room.messages.length;
            room.messages = room.messages.filter(msg => !msg.expiresAt || msg.expiresAt > now);
            if (room.messages.length < initialLength) {
                // Could emit an event here if we wanted to notify clients to remove it, 
                // but clients should also manage their own local state or rely on history sync.
                // For a truly secure chat, we should notify clients to delete local copies.
                // But for MVP, client-side timers are easier.
            }
        }
    }
}, 10000);

module.exports = {
    createRoom,
    joinRoom,
    getRoom,
    addClient,
    removeClient,
    getClientName,
    addMessage,
    getRoomMessages
};
