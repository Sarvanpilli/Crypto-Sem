"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

export default function Home() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('create');
    const [nickname, setNickname] = useState('');
    const [roomName, setRoomName] = useState('');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [joinPasskey, setJoinPasskey] = useState('');
    const [createdRoom, setCreatedRoom] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const storedNickname = sessionStorage.getItem('nickname');
        if (storedNickname) setNickname(storedNickname);
    }, []);

    const copyToClipboard = async (text) => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                alert('Copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy: ', err);
                fallbackCopy(text);
            }
        } else {
            fallbackCopy(text);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) alert('Copied to clipboard!');
            else alert('Failed to copy');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            alert('Failed to copy');
        }
    };

    const handleCreateRoom = async () => {
        if (!nickname) {
            setError('Please enter a nickname');
            return;
        }
        try {
            const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/create-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: roomName || 'New Room' }),
            });
            const data = await res.json();

            sessionStorage.setItem('nickname', nickname);
            setCreatedRoom(data);
            setError('');
        } catch (err) {
            setError('Failed to create room');
        }
    };

    const handleJoinRoom = async () => {
        if (!nickname) {
            setError('Please enter a nickname');
            return;
        }
        try {
            const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';
            const res = await fetch(`${serverUrl}/api/join-room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: joinRoomId, passkey: joinPasskey }),
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
                return;
            }

            sessionStorage.setItem(`room_${joinRoomId}_keys`, JSON.stringify({
                privateKey: data.privateKey,
                publicKey: data.publicKey
            }));
            sessionStorage.setItem('nickname', nickname);

            router.push(`/room/${joinRoomId}`);
        } catch (err) {
            setError('Failed to join room');
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4">
            <div className="text-center mb-10 animate-fade-in">
                <h1 className="text-6xl font-bold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600 tracking-tight">
                    Secure Chat
                </h1>
                <p className="text-gray-400 text-lg">End-to-end encrypted, ephemeral messaging.</p>
            </div>

            <div className="glass-card w-full max-w-md p-8 rounded-2xl animate-fade-in">
                <div className="mb-6">
                    <input
                        type="text"
                        placeholder="Enter your Nickname"
                        className="glass-input w-full p-4 rounded-xl text-center text-lg placeholder-gray-500"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                    />
                </div>

                <div className="flex mb-6 bg-gray-800/50 rounded-lg p-1">
                    <button
                        className={`flex-1 py-2 rounded-md transition-all ${activeTab === 'create' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        onClick={() => setActiveTab('create')}
                    >
                        Create Room
                    </button>
                    <button
                        className={`flex-1 py-2 rounded-md transition-all ${activeTab === 'join' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                        onClick={() => setActiveTab('join')}
                    >
                        Join Room
                    </button>
                </div>

                {activeTab === 'create' ? (
                    <div className="space-y-4 animate-fade-in">
                        <input
                            type="text"
                            placeholder="Room Name (Optional)"
                            className="glass-input w-full p-4 rounded-xl"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                        />
                        <button
                            onClick={handleCreateRoom}
                            className="glass-button w-full py-4 rounded-xl font-bold text-lg"
                        >
                            Generate Secure Room
                        </button>

                        {createdRoom && (
                            <div className="mt-6 p-4 bg-gray-800/50 rounded-xl border border-gray-700 animate-fade-in">
                                <div className="text-center mb-4">
                                    <p className="text-green-400 font-medium mb-1">Room Created Successfully!</p>
                                    <p className="text-xs text-gray-400">Share these details securely.</p>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Room ID</label>
                                        <div className="flex gap-2">
                                            <code className="flex-1 bg-black/30 p-2 rounded text-sm font-mono text-blue-300 truncate">{createdRoom.roomId}</code>
                                            <button onClick={() => copyToClipboard(createdRoom.roomId)} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white transition">Copy</button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 uppercase font-bold">Passkey</label>
                                        <div className="flex gap-2">
                                            <code className="flex-1 bg-black/30 p-2 rounded text-sm font-mono text-yellow-300 tracking-widest">{createdRoom.passkey}</code>
                                            <button onClick={() => copyToClipboard(createdRoom.passkey)} className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-white transition">Copy</button>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-6 flex justify-center bg-white p-3 rounded-lg w-fit mx-auto">
                                    <QRCodeSVG value={JSON.stringify({ roomId: createdRoom.roomId, passkey: createdRoom.passkey })} size={120} />
                                </div>

                                <button
                                    onClick={() => {
                                        sessionStorage.setItem(`room_${createdRoom.roomId}_keys`, JSON.stringify({
                                            privateKey: createdRoom.privateKey,
                                            publicKey: createdRoom.publicKey
                                        }));
                                        sessionStorage.setItem('nickname', nickname);
                                        router.push(`/room/${createdRoom.roomId}`);
                                    }}
                                    className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition shadow-lg"
                                >
                                    Enter Room Now
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in">
                        <input
                            type="text"
                            placeholder="Room ID"
                            className="glass-input w-full p-4 rounded-xl"
                            value={joinRoomId}
                            onChange={(e) => setJoinRoomId(e.target.value)}
                        />
                        <input
                            type="text"
                            placeholder="Passkey"
                            className="glass-input w-full p-4 rounded-xl"
                            value={joinPasskey}
                            onChange={(e) => setJoinPasskey(e.target.value)}
                        />
                        <button
                            onClick={handleJoinRoom}
                            className="glass-button w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-purple-600 to-pink-600"
                        >
                            Enter Room
                        </button>
                    </div>
                )}

                {error && <p className="text-red-400 mt-4 text-center text-sm bg-red-900/20 p-2 rounded border border-red-900/50">{error}</p>}
            </div>
        </div>
    );
}
