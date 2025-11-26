"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

export default function Home() {
    const router = useRouter();
    const [roomName, setRoomName] = useState('');
    const [joinRoomId, setJoinRoomId] = useState('');
    const [joinPasskey, setJoinPasskey] = useState('');
    const [createdRoom, setCreatedRoom] = useState(null);
    const [error, setError] = useState('');

    const handleCreateRoom = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/create-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomName: roomName || 'New Room' }),
            });
            const data = await res.json();
            setCreatedRoom(data);
        } catch (err) {
            setError('Failed to create room');
        }
    };

    const handleJoinRoom = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/join-room', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: joinRoomId, passkey: joinPasskey }),
            });
            const data = await res.json();

            if (data.error) {
                setError(data.error);
                return;
            }

            // Store keys in sessionStorage for the room page to access
            sessionStorage.setItem(`room_${joinRoomId}_keys`, JSON.stringify({
                privateKey: data.privateKey,
                publicKey: data.publicKey
            }));

            router.push(`/room/${joinRoomId}`);
        } catch (err) {
            setError('Failed to join room');
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                Secure Chat
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                {/* Create Room Section */}
                <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                    <h2 className="text-2xl font-semibold mb-4 text-blue-400">Create Room</h2>
                    <input
                        type="text"
                        placeholder="Room Name (Optional)"
                        className="w-full p-3 mb-4 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                    />
                    <button
                        onClick={handleCreateRoom}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded transition duration-200"
                    >
                        Generate Secure Room
                    </button>

                    {createdRoom && (
                        <div className="mt-6 p-4 bg-gray-700 rounded animate-fade-in">
                            <p className="text-sm text-gray-300 mb-2">Room Created!</p>
                            <div className="mb-2">
                                <span className="font-bold text-gray-400">Room ID:</span>
                                <p className="font-mono text-green-400 break-all">{createdRoom.roomId}</p>
                            </div>
                            <div className="mb-4">
                                <span className="font-bold text-gray-400">Passkey:</span>
                                <p className="font-mono text-yellow-400 text-xl tracking-widest">{createdRoom.passkey}</p>
                            </div>
                            <div className="flex justify-center bg-white p-2 rounded w-fit mx-auto">
                                <QRCodeSVG value={JSON.stringify({ roomId: createdRoom.roomId, passkey: createdRoom.passkey })} size={128} />
                            </div>
                            <p className="text-xs text-center text-gray-400 mt-2">Scan to join</p>
                        </div>
                    )}
                </div>

                {/* Join Room Section */}
                <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
                    <h2 className="text-2xl font-semibold mb-4 text-purple-400">Join Room</h2>
                    <input
                        type="text"
                        placeholder="Room ID"
                        className="w-full p-3 mb-4 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-purple-500"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Passkey"
                        className="w-full p-3 mb-4 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-purple-500"
                        value={joinPasskey}
                        onChange={(e) => setJoinPasskey(e.target.value)}
                    />
                    <button
                        onClick={handleJoinRoom}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded transition duration-200"
                    >
                        Enter Room
                    </button>
                    {error && <p className="text-red-500 mt-4 text-center">{error}</p>}
                </div>
            </div>
        </div>
    );
}
