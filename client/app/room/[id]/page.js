"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io from 'socket.io-client';
import {
    generateECDHKeyPair,
    exportPublicKey,
    importPublicKey,
    deriveSharedSecret,
    encryptMessage,
    decryptMessage,
    wrapKey,
    unwrapKey,
    storeKey,
    getKey
} from '../../../lib/crypto';

let socket;
let typingTimeout;

export default function Room() {
    const { id: roomId } = useParams();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [roomKey, setRoomKey] = useState(null);
    const [identityKey, setIdentityKey] = useState(null);
    const [status, setStatus] = useState('Initializing...');
    const [typingUser, setTypingUser] = useState('');
    const [ttl, setTtl] = useState(0);
    const messagesEndRef = useRef(null);
    const [joinRequest, setJoinRequest] = useState(null); // For Creator to see requests
    const [pendingRequests, setPendingRequests] = useState([]);
    const [showRequests, setShowRequests] = useState(false);

    useEffect(() => {
        const init = async () => {
            const nickname = sessionStorage.getItem('nickname');
            if (!nickname) {
                router.push('/');
                return;
            }

            // Check if we are the creator (have keys in DB)
            try {
                const storedIdentity = await getKey(`room_${roomId}_identity`);
                const storedRoomKey = await getKey(`room_${roomId}_key`);

                if (storedIdentity && storedRoomKey) {
                    setIdentityKey(storedIdentity);
                    setRoomKey(storedRoomKey);
                    connectSocket(nickname, storedIdentity.publicKey);
                } else {
                    // We are a joiner
                    const passkey = sessionStorage.getItem(`room_${roomId}_passkey`);
                    if (!passkey) {
                        alert("No passkey found. Please join via the home page.");
                        router.push('/');
                        return;
                    }
                    initJoinerFlow(nickname, passkey);
                }
            } catch (err) {
                console.error("Initialization error:", err);
                setStatus('Error initializing security');
            }
        };

        init();

        return () => {
            if (socket) {
                socket.disconnect();
                socket = null;
            }
        };
    }, [roomId, router]);

    const connectSocket = async (nickname, publicKey) => {
        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

        if (!socket) {
            socket = io(serverUrl, {
                transports: ['websocket'],
                reconnectionAttempts: 5,
            });
        }

        if (!socket.connected) socket.connect();

        // Export public key to send to server (for identification/key exchange)
        const exportedPubKey = await exportPublicKey(publicKey);

        socket.emit('join_room_socket', { roomId, nickname, publicKey: exportedPubKey });

        setupSocketListeners();
    };

    const initJoinerFlow = async (nickname, passkey) => {
        setStatus('Generating Keys...');
        try {
            // 1. Generate Identity Key
            const identityKeyPair = await generateECDHKeyPair();
            setIdentityKey(identityKeyPair);

            // 2. Export Public Key
            const exportedPubKey = await exportPublicKey(identityKeyPair.publicKey);

            const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

            // 3. Verify Passkey with API
            const res = await fetch(`${serverUrl}/api/join-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId, passkey }),
            });
            const data = await res.json();

            if (data.error) {
                alert(data.error);
                router.push('/');
                return;
            }

            // 4. Connect Socket & Request Join
            if (!socket) {
                socket = io(serverUrl, { transports: ['websocket'] });
            }
            socket.connect();

            setStatus('Waiting for approval...');
            socket.emit('request_join', { roomId, publicKey: exportedPubKey, nickname });

            // 5. Listen for Approval
            socket.on('join_approved', async ({ encryptedKey, roomId: approvedRoomId }) => {
                if (approvedRoomId !== roomId) return;
                setStatus('Approval Received. Unwrapping Key...');

                try {
                    // Import Creator's Public Key
                    const creatorPubKey = await importPublicKey(data.creatorPublicKey);

                    // Derive Shared Secret
                    const sharedSecret = await deriveSharedSecret(identityKeyPair.privateKey, creatorPubKey);

                    // Unwrap Room Key
                    const unwrappedRoomKey = await unwrapKey(encryptedKey, sharedSecret);
                    setRoomKey(unwrappedRoomKey);

                    // Store Keys
                    await storeKey(`room_${roomId}_identity`, identityKeyPair);
                    await storeKey(`room_${roomId}_key`, unwrappedRoomKey);

                    setStatus('Connected (Encrypted)');

                    // Now fully join
                    socket.emit('join_room_socket', { roomId, nickname, publicKey: exportedPubKey });
                    setupSocketListeners();
                } catch (err) {
                    console.error("Key exchange failed:", err);
                    setStatus('Key Exchange Failed');
                }
            });

        } catch (err) {
            console.error("Join flow error:", err);
            setStatus('Join Error');
        }
    };

    const setupSocketListeners = () => {
        socket.on('connect', () => setStatus('Connected (Encrypted)'));
        socket.on('disconnect', () => setStatus('Disconnected'));

        socket.on('user_joined', ({ nickname }) => {
            setMessages(prev => [...prev, { system: true, text: `${nickname} joined.` }]);
        });

        socket.on('receive_message', async (data) => {
            await handleReceiveMessage(data);
        });

        socket.on('message_history', async (history) => {
            for (const msg of history) {
                await handleReceiveMessage(msg, true);
            }
        });

        socket.on('user_typing', ({ nickname }) => setTypingUser(nickname));
        socket.on('user_stop_typing', () => setTypingUser(''));

        // Creator: Handle new user requests
        socket.on('new_user_request', async ({ socketId, publicKey, nickname }) => {
            console.log(`[DEBUG] Received new_user_request from ${nickname} (${socketId})`);

            // Add to pending requests list instead of auto-approving
            setPendingRequests(prev => {
                // Avoid duplicates
                if (prev.some(req => req.socketId === socketId)) return prev;
                return [...prev, { socketId, publicKey, nickname }];
            });
            setShowRequests(true); // Auto-open the list to alert the creator
        });
    };

    const approveRequest = async (request) => {
        await approveUser(request.socketId, request.publicKey);
        setPendingRequests(prev => prev.filter(r => r.socketId !== request.socketId));
        if (pendingRequests.length <= 1) setShowRequests(false);
    };

    const rejectRequest = (socketId) => {
        setPendingRequests(prev => prev.filter(r => r.socketId !== socketId));
        if (pendingRequests.length <= 1) setShowRequests(false);
        // Optionally emit a 'join_rejected' event here
    };

    const approveUser = async (targetSocketId, targetPublicKey) => {
        console.log(`[DEBUG] Approving user ${targetSocketId}...`);
        try {
            // 1. Import User's Public Key
            const userPubKey = await importPublicKey(targetPublicKey);

            // 2. Get our Private Key (Identity)
            // We need to fetch it from state or DB. We have it in state `identityKey`.
            if (!identityKey || !roomKey) {
                console.error("[DEBUG] Cannot approve: Missing identityKey or roomKey", { identityKey, roomKey });
                return;
            }

            // 3. Derive Shared Secret
            const sharedSecret = await deriveSharedSecret(identityKey.privateKey, userPubKey);

            // 4. Wrap Room Key
            const wrappedKey = await wrapKey(roomKey, sharedSecret);

            // 5. Send Encrypted Key
            socket.emit('approve_join', {
                targetSocketId,
                encryptedKey: wrappedKey,
                roomId
            });
            console.log("Approved user and sent key.");
        } catch (err) {
            console.error("Failed to approve user:", err);
        }
    };

    const handleReceiveMessage = async (data, isHistory = false) => {
        if (!roomKey) return;
        try {
            const decryptedText = await decryptMessage(roomKey, data.message, data.nonce);
            const msgObj = {
                text: decryptedText,
                sender: data.sender === socket.id ? 'Me' : 'Peer',
                senderName: data.sender === socket.id ? 'Me' : (data.senderName || 'Peer'),
                timestamp: data.timestamp,
                expiresAt: data.expiresAt
            };

            setMessages(prev => {
                // Dedup
                if (prev.some(m => m.timestamp === msgObj.timestamp && m.text === msgObj.text)) return prev;
                return isHistory ? [msgObj, ...prev].sort((a, b) => a.timestamp - b.timestamp) : [...prev, msgObj];
            });
        } catch (err) {
            console.error("Decryption failed:", err);
        }
    };

    const handleInputChange = (e) => {
        setInput(e.target.value);
        if (socket) {
            socket.emit('typing', { roomId });
            if (typingTimeout) clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => socket.emit('stop_typing', { roomId }), 1000);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || !roomKey) return;

        try {
            const { ciphertext, iv } = await encryptMessage(roomKey, input);

            socket.emit('send_message', {
                roomId,
                message: ciphertext, // Array of numbers
                nonce: iv,           // Array of numbers
                sender: socket.id,
                ttl
            });

            socket.emit('stop_typing', { roomId });
            setInput('');
        } catch (err) {
            console.error("Encryption failed:", err);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typingUser]);

    // Cleanup interval for local messages
    useEffect(() => {
        const interval = setInterval(() => {
            setMessages(prev => {
                const now = Date.now();
                return prev.filter(msg => !msg.expiresAt || msg.expiresAt > now);
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen flex flex-col p-4 md:p-8">
            {/* Header */}
            <header className="glass-card p-4 rounded-xl mb-4 flex justify-between items-center animate-fade-in relative z-50">
                <div>
                    <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                        Room: <span className="font-mono text-white text-base">{roomId}</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status.includes('Connected') ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        <p className="text-xs text-gray-400">{status}</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Pending Requests Icon */}
                    {roomKey && identityKey && ( // Only show for creator/approved members
                        <div className="relative">
                            <button
                                onClick={() => setShowRequests(!showRequests)}
                                className="p-2 rounded-full hover:bg-gray-700/50 transition relative"
                                title="Pending Join Requests"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-gray-300">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                                </svg>
                                {pendingRequests.length > 0 && (
                                    <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full animate-pulse">
                                        {pendingRequests.length}
                                    </span>
                                )}
                            </button>

                            {/* Dropdown for Requests */}
                            {showRequests && (
                                <div className="absolute right-0 top-12 w-72 glass-card border border-gray-700 rounded-xl shadow-2xl p-4 animate-fade-in">
                                    <h3 className="text-sm font-bold text-gray-300 mb-3 border-b border-gray-700 pb-2">Pending Requests</h3>
                                    {pendingRequests.length === 0 ? (
                                        <p className="text-xs text-gray-500 text-center py-2">No pending requests</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {pendingRequests.map((req) => (
                                                <div key={req.socketId} className="flex justify-between items-center bg-gray-800/50 p-2 rounded-lg">
                                                    <div>
                                                        <p className="text-sm font-bold text-white">{req.nickname}</p>
                                                        <p className="text-[10px] text-gray-500 font-mono truncate w-20">{req.socketId}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => approveRequest(req)}
                                                            className="p-1.5 bg-green-500/20 hover:bg-green-500/40 text-green-400 rounded-md transition"
                                                            title="Approve"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => rejectRequest(req.socketId)}
                                                            className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-md transition"
                                                            title="Reject"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                                                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        onClick={() => router.push('/')}
                        className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg transition"
                    >
                        Leave Room
                    </button>
                </div>
            </header>

            {/* Chat Area */}
            <div className="flex-1 glass-card rounded-xl p-4 mb-4 overflow-y-auto space-y-4 relative">
                {messages.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-500 opacity-50">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                )}

                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.system ? 'justify-center' : (msg.sender === 'Me' ? 'justify-end' : 'justify-start')} animate-fade-in`}>
                        {msg.system ? (
                            <span className="text-xs text-gray-400 bg-gray-800/50 px-3 py-1 rounded-full border border-gray-700">{msg.text}</span>
                        ) : (
                            <div className={`max-w-[85%] md:max-w-md p-4 rounded-2xl shadow-lg backdrop-blur-sm ${msg.sender === 'Me'
                                ? 'bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-tr-none'
                                : 'bg-gray-800/80 text-gray-100 rounded-tl-none border border-gray-700'
                                }`}>
                                <div className="flex justify-between items-center mb-1 gap-4">
                                    <p className={`text-xs font-bold ${msg.sender === 'Me' ? 'text-blue-200' : 'text-purple-300'}`}>{msg.senderName}</p>
                                    {msg.expiresAt && (
                                        <span className="text-[10px] flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span>
                                            {Math.max(0, Math.ceil((msg.expiresAt - Date.now()) / 1000))}s
                                        </span>
                                    )}
                                </div>
                                <p className="leading-relaxed break-words">{msg.text}</p>
                                <p className={`text-[10px] mt-2 text-right ${msg.sender === 'Me' ? 'text-blue-200' : 'text-gray-400'}`}>
                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        )}
                    </div>
                ))}
                {typingUser && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-gray-800/50 px-4 py-2 rounded-full flex items-center gap-2">
                            <span className="text-xs text-gray-400">{typingUser} is typing</span>
                            <div className="flex gap-1">
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                <span className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="glass-card p-2 rounded-xl flex gap-2 items-center">
                <select
                    value={ttl}
                    onChange={(e) => setTtl(Number(e.target.value))}
                    className="bg-gray-800/50 text-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm border border-gray-700 hover:bg-gray-800 transition cursor-pointer"
                    title="Message Timer"
                >
                    <option value={0}>∞ Keep</option>
                    <option value={10}>10s</option>
                    <option value={60}>1m</option>
                    <option value={3600}>1h</option>
                </select>
                <input
                    type="text"
                    className="flex-1 bg-transparent text-white p-3 focus:outline-none placeholder-gray-500"
                    placeholder="Type a secure message..."
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                />
                <button
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    className={`px-6 py-3 rounded-lg font-bold transition shadow-lg flex items-center gap-2 ${input.trim()
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white transform hover:-translate-y-0.5'
                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                >
                    <span>Send</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
