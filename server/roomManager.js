const { v4: uuidv4 } = require('uuid');
const NodeRSA = require('node-rsa');

const rooms = new Map();

// Room lifetime in milliseconds (e.g., 1 hour)
const ROOM_LIFETIME = 60 * 60 * 1000;

function createRoom(roomName) {
    const roomId = uuidv4();
    const passkey = uuidv4().slice(0, 6).toUpperCase(); // Simple 6-char passkey

    // Generate RSA keys
    const key = new NodeRSA({ b: 512 }); // 512 bits for speed in MVP, use 2048+ for prod
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
        clients: new Set(),
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
    return room ? room.messages : [];
}

module.exports = {
    createRoom,
    joinRoom,
    getRoom,
    addMessage,
    getRoomMessages
};
