"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io from 'socket.io-client';
import JSEncrypt from 'jsencrypt';

let socket;
let typingTimeout;

export default function Room() {
    const { id: roomId } = useParams();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [keys, setKeys] = useState(null);
    const [status, setStatus] = useState('Connecting...');
    const [typingUser, setTypingUser] = useState('');
    const [ttl, setTtl] = useState(0); // 0 = Off
    const messagesEndRef = useRef(null);

    useEffect(() => {
        // Load keys from session storage
        const storedKeys = sessionStorage.getItem(`room_${roomId}_keys`);
        if (!storedKeys) {
            router.push('/');
            return;
        }
        const parsedKeys = JSON.parse(storedKeys);
        setKeys(parsedKeys);

        // Load nickname
        const nickname = sessionStorage.getItem('nickname') || 'Anonymous';

        // Initialize Socket
        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

        // Ensure we don't create multiple connections
        if (!socket) {
            socket = io(serverUrl, {
                transports: ['websocket'], // Force websocket for better performance/stability
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
            });
        }

        if (!socket.connected) {
            socket.connect();
        }

        socket.emit('join_room_socket', { roomId, nickname });

        const onConnect = () => setStatus('Connected (Encrypted)');
        const onDisconnect = () => setStatus('Disconnected');
        const onConnectError = (err) => {
            console.error("Connection error:", err);
            setStatus('Connection Error');
        };

        const onUserJoined = ({ userId, nickname }) => {
            setMessages(prev => [...prev, { system: true, text: `${nickname} joined.` }]);
        };

        const onMessageHistory = (history) => {
            try {
                const decryptedHistory = history.map(msg => {
                    try {
                        const decryptor = new JSEncrypt();
                        decryptor.setPrivateKey(parsedKeys.privateKey);
                        const decryptedText = decryptor.decrypt(msg.message);

                        if (!decryptedText) return null;

                        return {
                            text: decryptedText,
                            sender: msg.sender === socket.id ? 'Me' : 'Peer',
                            senderName: msg.sender === socket.id ? 'Me' : (msg.senderName || 'Peer'),
                            timestamp: msg.timestamp,
                            expiresAt: msg.expiresAt
                        };
                    } catch (e) {
                        console.error("Failed to decrypt history message", e);
                        return null;
                    }
                }).filter(Boolean);

                setMessages(prev => {
                    // Avoid duplicates from history if re-connecting
                    const existingTimestamps = new Set(prev.map(m => m.timestamp));
                    const newHistory = decryptedHistory.filter(m => !existingTimestamps.has(m.timestamp));
                    return [...newHistory, ...prev];
                });
            } catch (err) {
                console.error("Failed to process history", err);
            }
        };

        const onReceiveMessage = ({ message, sender, senderName, timestamp, expiresAt }) => {
            try {
                // Decrypt message
                const decryptor = new JSEncrypt();
                decryptor.setPrivateKey(parsedKeys.privateKey);
                const decryptedText = decryptor.decrypt(message);

                if (!decryptedText) throw new Error("Decryption returned null");

                setMessages(prev => [...prev, {
                    text: decryptedText,
                    sender: sender === socket.id ? 'Me' : 'Peer',
                    senderName: sender === socket.id ? 'Me' : (senderName || 'Peer'),
                    timestamp,
                    expiresAt
                }]);
            } catch (err) {
                console.error("Decryption failed", err);
                setMessages(prev => [...prev, { system: true, text: "Failed to decrypt message." }]);
            }
        };

        const onUserTyping = ({ nickname }) => {
            setTypingUser(nickname);
        };

        const onUserStopTyping = () => {
            setTypingUser('');
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('connect_error', onConnectError);
        socket.on('user_joined', onUserJoined);
        socket.on('message_history', onMessageHistory);
        socket.on('receive_message', onReceiveMessage);
        socket.on('user_typing', onUserTyping);
        socket.on('user_stop_typing', onUserStopTyping);

        // Cleanup interval for local messages
        const cleanupInterval = setInterval(() => {
            setMessages(prev => {
                const now = Date.now();
                const validMessages = prev.filter(msg => !msg.expiresAt || msg.expiresAt > now);
                if (validMessages.length !== prev.length) {
                    return validMessages;
                }
                return prev;
            });
        }, 1000);

        return () => {
            socket.off('connect', onConnect);
            socket.off('disconnect', onDisconnect);
            socket.off('connect_error', onConnectError);
            socket.off('user_joined', onUserJoined);
            socket.off('message_history', onMessageHistory);
            socket.off('receive_message', onReceiveMessage);
            socket.off('user_typing', onUserTyping);
            socket.off('user_stop_typing', onUserStopTyping);

            clearInterval(cleanupInterval);
            socket.disconnect();
            socket = null; // Reset global variable
        };
    }, [roomId, router]);

    const handleInputChange = (e) => {
        setInput(e.target.value);

        if (socket) {
            socket.emit('typing', { roomId });

            if (typingTimeout) clearTimeout(typingTimeout);

            typingTimeout = setTimeout(() => {
                socket.emit('stop_typing', { roomId });
            }, 1000);
        }
    };

    const sendMessage = () => {
        if (!input.trim() || !keys) return;

        try {
            // Encrypt with Public Key
            const encryptor = new JSEncrypt();
            encryptor.setPublicKey(keys.publicKey);
            const encrypted = encryptor.encrypt(input);

            if (!encrypted) throw new Error("Encryption returned null");

            socket.emit('send_message', {
                roomId,
                message: encrypted,
                sender: socket.id,
                ttl
            });

            socket.emit('stop_typing', { roomId });
            if (typingTimeout) clearTimeout(typingTimeout);

            setInput('');
        } catch (err) {
            console.error("Encryption failed", err);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, typingUser]);

    return (
        <div className="min-h-screen flex flex-col p-4 md:p-8">
            {/* Header */}
            <header className="glass-card p-4 rounded-xl mb-4 flex justify-between items-center animate-fade-in">
                <div>
                    <h1 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">
                        Room: <span className="font-mono text-white text-base">{roomId}</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${status.includes('Connected') ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <p className="text-xs text-gray-400">{status}</p>
                    </div>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-400 px-4 py-2 rounded-lg transition"
                >
                    Leave Room
                </button>
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
