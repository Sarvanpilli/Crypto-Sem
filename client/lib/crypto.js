const getSubtleCrypto = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        return window.crypto.subtle;
    }
    throw new Error("WebCrypto API is not available. Please ensure you are using a Secure Context (HTTPS or localhost).");
};

export const generateECDHKeyPair = async () => {
    const subtle = getSubtleCrypto();
    return await subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
    );
};

export const generateRoomKey = async () => {
    const subtle = getSubtleCrypto();
    return await subtle.generateKey(
        {
            name: "AES-GCM",
            length: 256,
        },
        true,
        ["encrypt", "decrypt"]
    );
};

export const exportPublicKey = async (key) => {
    const subtle = getSubtleCrypto();
    const exported = await subtle.exportKey("jwk", key);
    return exported;
};

export const importPublicKey = async (jwk) => {
    const subtle = getSubtleCrypto();
    return await subtle.importKey(
        "jwk",
        jwk,
        {
            name: "ECDH",
            namedCurve: "P-256",
        },
        true,
        []
    );
};

export const deriveSharedSecret = async (privateKey, publicKey) => {
    const subtle = getSubtleCrypto();
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

export const encryptMessage = async (key, message) => {
    const subtle = getSubtleCrypto();
    const encoded = new TextEncoder().encode(message);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
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

export const decryptMessage = async (key, ciphertext, iv) => {
    const subtle = getSubtleCrypto();
    const decrypted = await subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(iv),
        },
        key,
        new Uint8Array(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
};

export const wrapKey = async (keyToWrap, wrappingKey) => {
    const subtle = getSubtleCrypto();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await subtle.wrapKey(
        "raw",
        keyToWrap,
        wrappingKey,
        {
            name: "AES-GCM",
            iv: iv
        }
    );
    return {
        wrappedKey: Array.from(new Uint8Array(wrapped)),
        iv: Array.from(iv)
    };
};

export const unwrapKey = async (wrappedKeyData, unwrappingKey) => {
    const subtle = getSubtleCrypto();
    return await subtle.unwrapKey(
        "raw",
        new Uint8Array(wrappedKeyData.wrappedKey),
        unwrappingKey,
        {
            name: "AES-GCM",
            iv: new Uint8Array(wrappedKeyData.iv)
        },
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
};

// IndexedDB Helpers
const DB_NAME = 'SecureChatDB';
const STORE_NAME = 'keys';

export const openDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
};

export const storeKey = async (id, key) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(key, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
};

export const getKey = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};
