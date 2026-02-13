# Crypto-Sem: Secure Zero-Knowledge Chat

Crypto-Sem is a secure, real-time communication platform built with **Next.js** and **Express/Socket.IO**. It features **End-to-End Encryption (E2EE)** using ECDH key exchange and AES-GCM encryption, ensuring that the server never sees the raw content of your messages.

## 🚀 Features

-   **Zero-Knowledge Architecture**: Messages are encrypted on the client side before being sent. The server only relays encrypted data.
-   **End-to-End Encryption**:
    -   **ECDH (Elliptic Curve Diffie-Hellman)** for secure key exchange.
    -   **AES-GCM** for authenticated message encryption.
-   **Secure Rooms**:
    -   Create rooms with a unique **Room ID** and **Passkey**.
    -   **Creator Approval**: The room creator must manually approve new participants.
    -   **QR Code Sharing**: Easily share room credentials via QR code.
-   **Real-Time Messaging**: Powered by Socket.IO for instant communication.
-   **Ephemeral Messages**: Set a **TTL (Time To Live)** for messages (e.g., 10s, 1m, 1h) to automatically expire them.
-   **Typing Indicators**: See when others are typing.
-   **Modern UI**: Built with Tailwind CSS, featuring a glassmorphism design and dark mode.

## 🛠️ Tech Stack

### Frontend (`/client`)
-   **Framework**: [Next.js 15+](https://nextjs.org/) (App Router)
-   **Language**: JavaScript / React
-   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
-   **Real-time**: `socket.io-client`
-   **Encryption**: Web Crypto API (ECDH, AES-GCM)
-   **Utilities**: `qrcode.react`

### Backend (`/server`)
-   **Runtime**: Node.js
-   **Framework**: [Express.js](https://expressjs.com/)
-   **Real-time**: [Socket.IO](https://socket.io/)
-   **Encryption Utilities**: `node-rsa`, `uuid`

## 📦 Installation & Setup

### Prerequisites
-   Node.js (v18+ recommended)
-   npm or yarn

### 1. Setup the Backend Server

Navigate to the `server` directory and install dependencies:

```bash
cd server
npm install
```

Start the server:

```bash
node index.js
# Server runs on http://localhost:3001
```

### 2. Setup the Frontend Client

Navigate to the `client` directory and install dependencies:

```bash
cd client
npm install
```

Start the development server:

```bash
npm run dev
# Client runs on http://localhost:3000
```

## 📖 Usage Guide

1.  **Create a Room**:
    -   Open the app at `http://localhost:3000`.
    -   Enter a nickname and click **Create Room**.
    -   Share the **Room ID** and **Passkey** (or QR Code) with friends.

2.  **Join a Room**:
    -   Enter your nickname, the **Room ID**, and the **Passkey**.
    -   Click **Enter Room**.
    -   Wait for the room creator to **approve** your request.

3.  **Chat Securely**:
    -   Once approved, keys are exchanged securely.
    -   Send messages. You can set a timer (TTL) for messages to auto-delete.

## 🔒 Security Details

-   **Key Exchange**: When a user joins, they generate an ephemeral ECDH key pair. The creator (who holds the room key) derives a shared secret with the joiner's public key and sends the Room Key encrypted (wrapped) with that shared secret.
-   **Message Encryption**: All messages are encrypted with the shared Room Key using AES-GCM. The IV (Nonce) is unique for every message.
-   **Storage**: Keys are stored in `IndexedDB` (non-extractable where possible) or `sessionStorage` for the session duration.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📄 License

This project is licensed under the ISC License.
