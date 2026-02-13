# Crypto-Sem: Presentation & Breakdown Notes

## 🎯 Goal of the Presentation
To demonstrate a **secure, zero-knowledge communication platform** that guarantees privacy even if the server is compromised.

---

## 🗣️ Elevator Pitch (The "Hook")
"In an age of data breaches and surveillance, privacy is not a luxury—it's a necessity. **Crypto-Sem** is a real-time chat application where **the server knows nothing**. Unlike traditional apps where the server reads and stores your messages, Crypto-Sem uses **End-to-End Encryption (E2EE)**. We use military-grade AES-GCM encryption and ECDH key exchange to ensure that only the people in the room hold the keys. Even I, as the developer and server host, cannot read a single message."

---

## 🏗️ Core Architecture

### The "Zero-Knowledge" Concept
*   **Traditional Chat**: Client A -> Server (Stores Msg) -> Client B. (Server sees everything).
*   **Crypto-Sem**: Client A (Encrypts) -> Server (Relays Blob) -> Client B (Decrypts).
    *   **Server Role**: Dumb relay. It just passes opaque packets of data.
    *   **Client Role**: Smart endpoint. Handles all cryptography (Key generation, Encryption, Decryption).

### The Stack
*   **Frontend**: Next.js (React) - For a responsive, modern UI.
*   **Backend**: Node.js + Express + Socket.IO - For real-time, low-latency event handling.
*   **Cryptography**: Web Crypto API (Native browser standard, faster and more secure than JS libraries).

---

## 🔐 Security Deep Dive (The "Meat")

This is the most important part. Explain this step-by-step.

### 1. The Algorithms
*   **ECDH (Elliptic Curve Diffie-Hellman)**: Used for **Key Exchange**. It allows two parties to generate a shared secret over an insecure channel without ever sending the secret itself. We use the **P-256** curve.
*   **AES-GCM (Advanced Encryption Standard - Galois/Counter Mode)**: Used for **Message Encryption**. It provides both confidentiality (nobody can read it) and integrity (nobody tampered with it). We use **256-bit keys**.

### 2. The "Handshake" (How a user joins)
*   **Step 1: Room Creation**: 
    *   Alice (Creator) generates a **Room Key** (AES-256). This key never leaves her device unencrypted.
    *   She also generates an **Identity Key** (ECDH).
*   **Step 2: Joining Request**:
    *   Bob (Joiner) generates his own **Identity Key** (ECDH).
    *   He sends his **Public Key** to the server.
*   **Step 3: Approval & Key Wrapping**:
    *   Alice sees Bob's request. She approves it.
    *   Alice's device takes Bob's Public Key and her Private Key to derive a **Shared Secret** (via ECDH).
    *   Alice **wraps** (encrypts) the **Room Key** using this Shared Secret.
    *   Alice sends the **Wrapped Key** to Bob via the server.
*   **Step 4: Unwrapping**:
    *   Bob receives the Wrapped Key.
    *   He derives the *same* Shared Secret (using his Private Key and Alice's Public Key).
    *   He **unwraps** (decrypts) the **Room Key**.
*   **Result**: Now both Alice and Bob have the **Room Key**, but the server never saw it.

### 3. Messaging
*   When Alice sends "Hello":
    *   `Encrypt(RoomKey, "Hello")` -> `Ciphertext`
    *   Server receives `Ciphertext` and broadcasts it.
    *   Bob receives `Ciphertext` -> `Decrypt(RoomKey, Ciphertext)` -> "Hello".

---

## 💻 Live Demo Script

1.  **Open Two Windows**: One Incognito (Bob), one Normal (Alice).
2.  **Alice (Creator)**:
    *   Go to `localhost:3000`.
    *   Enter Nickname: "Alice".
    *   Click **Create Room**.
    *   **Highlight**: "Notice the Room ID and Passkey. These are the keys to the castle."
3.  **Bob (Joiner)**:
    *   Go to `localhost:3000`.
    *   Enter Nickname: "Bob".
    *   Click **Join Room**.
    *   Enter the Room ID and Passkey from Alice.
    *   **Highlight**: "I am now requesting access. The server verifies the passkey, but it *cannot* give me the encryption keys. Only Alice can."
4.  **Alice (Approval)**:
    *   Show the "Pending Requests" notification.
    *   Click **Approve**.
    *   **Explain**: "Right now, a secure cryptographic handshake is happening. Keys are being exchanged."
5.  **Chatting**:
    *   Send a message from Alice. See it appear on Bob's screen.
    *   **Show the Console** (Optional): Open DevTools, look at the Socket.IO messages. Show that the payload is `ciphertext`, not "Hello". This proves the server can't read it.
6.  **TTL (Time To Live)**:
    *   Set timer to 10s. Send a message. Watch it disappear.
    *   **Explain**: "For sensitive conversations, messages self-destruct."

---

## ❓ Anticipated Q&A

**Q: Why use AES-GCM and not just RSA?**
*   **A**: RSA is slow and meant for small data (like keys). AES is incredibly fast and meant for encrypting long messages. We use ECDH (similar role to RSA) to exchange the AES key, then use AES for the actual chat.a

**Q: What if the server is compromised?**
*   **A**: The attacker would see encrypted blobs. Without the keys (which are only on the clients' devices), the data is useless garbage.

**Q: Where are keys stored?**
*   **A**: In the browser's `IndexedDB` or `sessionStorage`. They are never sent to a database.

**Q: Is this truly "Zero-Knowledge"?**
*   **A**: Yes, regarding the message content. The server knows *who* is talking (metadata) and *when*, but not *what* they are saying.

**Q: Is this vulnerable to Man-in-the-Middle (MitM) attacks?**
*   **A**: If the server itself is malicious, **yes**. A malicious server could swap the Public Keys during the handshake (Active MitM).
    *   **Current Defense**: The "Passkey" prevents unauthorized *users* from joining, but it doesn't stop a compromised server.
    *   **The Real Solution**: To fix this, we would need **Out-of-Band Verification** (e.g., Alice and Bob compare a "Safety Number" or "Fingerprint" over a phone call) to verify they are holding the correct keys. This is how Signal/WhatsApp handle it.

---

## 🧩 Code Implementation (Reference)

Here are the actual core functions used in the project.

### 1. ECDH Key Generation (Identity Key)
```javascript
export const generateECDHKeyPair = async () => {
    const subtle = window.crypto.subtle;
    return await subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256", // NIST P-256 curve
        },
        true, // Extractable (we need to export public key)
        ["deriveKey", "deriveBits"]
    );
};
```

### 2. AES-GCM Key Generation (Room Key)
```javascript
export const generateRoomKey = async () => {
    const subtle = window.crypto.subtle;
    return await subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256, // Military-grade 256-bit key
        },
        true,
        ["encrypt", "decrypt"]
    );
};
```

### 3. Deriving Shared Secret (ECDH)
```javascript
export const deriveSharedSecret = async (privateKey, publicKey) => {
    const subtle = window.crypto.subtle;
    return await subtle.deriveKey(
        {
            name: "ECDH",
            public: publicKey,
        },
        privateKey,
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
    );
};
```

### 4. Encrypting Messages (AES-GCM)
```javascript
export const encryptMessage = async (key, message) => {
    const subtle = window.crypto.subtle;
    const encoded = new TextEncoder().encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Unique IV for every message
    const ciphertext = await subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv,
        },
        key,
        encoded
    );

    return {
        ciphertext: Array.from(new Uint8Array(ciphertext)),
        iv: Array.from(iv)
    };
};
```
