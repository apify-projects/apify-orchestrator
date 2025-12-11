import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface EncryptionKey {
    hashed32Bytes: string;
}

export function processEncryptionKey(rawKey: string): EncryptionKey {
    return {
        hashed32Bytes: createHash('sha256').update(rawKey).digest('hex').slice(0, 32),
    };
}

export function encryptString(toBeEncrypted: string, encryptionKey: EncryptionKey): string {
    const iv = randomBytes(16);
    const key = new Uint8Array(Buffer.from(encryptionKey.hashed32Bytes));
    const cipher = createCipheriv('aes-256-cbc', key, new Uint8Array(iv));

    const inputBuffer = new Uint8Array(Buffer.from(toBeEncrypted));
    const updateResult = cipher.update(inputBuffer);
    const finalResult = cipher.final();

    // Combine the results
    const encrypted = new Uint8Array(updateResult.length + finalResult.length);
    encrypted.set(updateResult, 0);
    encrypted.set(finalResult, updateResult.length);

    const result = {
        data: Buffer.from(encrypted).toString('base64'),
        iv: iv.toString('base64'),
    };

    return Buffer.from(JSON.stringify(result)).toString('base64');
}

export function decryptString(toBeDecrypted: string, encryptionKey: EncryptionKey): string {
    const { data, iv } = JSON.parse(Buffer.from(toBeDecrypted, 'base64').toString());

    const key = new Uint8Array(Buffer.from(encryptionKey.hashed32Bytes));
    const ivBuffer = new Uint8Array(Buffer.from(iv, 'base64'));
    const decipher = createDecipheriv('aes-256-cbc', key, ivBuffer);

    const encryptedData = new Uint8Array(Buffer.from(data, 'base64'));
    const updateResult = decipher.update(encryptedData);
    const finalResult = decipher.final();

    // Combine the results
    const decrypted = new Uint8Array(updateResult.length + finalResult.length);
    decrypted.set(updateResult, 0);
    decrypted.set(finalResult, updateResult.length);

    return Buffer.from(decrypted).toString();
}
