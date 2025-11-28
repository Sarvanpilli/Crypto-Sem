const { v4: uuidv4 } = require('uuid');

// Store rooms in memory
const rooms = new Map();

// Room lifetime in milliseconds (e.g., 1 hour)
const ROOM_LIFETIME = 60 * 60 * 1000;

function createRoom(roomName, creatorPublicKey) {
    const roomId = uuidv4();
    const passkey = Math.random().toString(36).substring(2, 8).toUpperCase();

    const room = {
        id: roomId,
        name: roomName,
        passkey,
        creatorPublicKey, // Stored for new users to initiate ECDH
        createdAt: Date.now(),
        expiresAt: Date.now() + ROOM_LIFETIME,
        clients: new Map(), // Map<socketId, { nickname, publicKey }>
        messages: []
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
        passkey
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

    // Return the creator's public key so the client can initiate ECDH
    return {
        success: true,
        roomName: room.name,
        creatorPublicKey: room.creatorPublicKey
    };
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function addClient(roomId, socketId, nickname, publicKey) {
    const room = rooms.get(roomId);
    if (room) {
        room.clients.set(socketId, { nickname, publicKey });
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
