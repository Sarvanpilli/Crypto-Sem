"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import io from 'socket.io-client';
import JSEncrypt from 'jsencrypt';

let socket;

export default function Room() {
    const { id: roomId } = useParams();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [keys, setKeys] = useState(null);
    const [status, setStatus] = useState('Connecting...');
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

        // Initialize Socket
        const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
        socket = io(serverUrl);

        socket.emit('join_room_socket', { roomId });

        socket.on('connect', () => {
            setStatus('Connected (Encrypted)');
        });

        socket.on('user_joined', ({ userId }) => {
            setMessages(prev => [...prev, { system: true, text: `User joined.` }]);
        });

        socket.on('message_history', (history) => {
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
                            timestamp: msg.timestamp
                        };
                    } catch (e) {
                        console.error("Failed to decrypt history message", e);
                        return null;
                    }
                }).filter(Boolean);

                setMessages(prev => [...decryptedHistory, ...prev]);
            } catch (err) {
                console.error("Failed to process history", err);
            }
        });

        socket.on('receive_message', ({ message, sender, timestamp }) => {
            try {
                // Decrypt message
                const decryptor = new JSEncrypt();
                decryptor.setPrivateKey(parsedKeys.privateKey);
                const decryptedText = decryptor.decrypt(message);

                if (!decryptedText) throw new Error("Decryption returned null");

                setMessages(prev => [...prev, {
                    text: decryptedText,
                    sender: sender === socket.id ? 'Me' : 'Peer',
                    timestamp
                }]);
            } catch (err) {
                console.error("Decryption failed", err);
                setMessages(prev => [...prev, { system: true, text: "Failed to decrypt message." }]);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [roomId, router]);

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
                sender: socket.id
            });

            setInput('');
        } catch (err) {
            console.error("Encryption failed", err);
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col">
            {/* Header */}
            <header className="bg-gray-800 p-4 shadow border-b border-gray-700 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-blue-400">Room: {roomId}</h1>
                    <p className="text-xs text-green-400">{status}</p>
                </div>
                <button
                    onClick={() => router.push('/')}
                    className="text-sm text-gray-400 hover:text-white"
                >
                    Leave Room
                </button>
            </header>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.system ? 'justify-center' : (msg.sender === 'Me' ? 'justify-end' : 'justify-start')}`}>
                        {msg.system ? (
                            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">{msg.text}</span>
                        ) : (
                            <div className={`max-w-xs md:max-w-md p-3 rounded-lg ${msg.sender === 'Me' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                                <p>{msg.text}</p>
                                <p className="text-[10px] text-gray-300 mt-1 text-right">{new Date(msg.timestamp).toLocaleTimeString()}</p>
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-gray-800 p-4 border-t border-gray-700">
                <div className="flex gap-2">
                    <input
                        type="text"
                        className="flex-1 bg-gray-700 text-white p-3 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Type a secure message..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button
                        onClick={sendMessage}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded font-bold transition"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
