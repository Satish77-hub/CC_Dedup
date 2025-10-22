// lambda/upload.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const zlib = require('zlib');
const { ok, err } = require('./cors');

const s3 = new S3Client({});
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;
const CHUNKS_TABLE = process.env.CHUNKS_TABLE_NAME;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

exports.handler = async (event) => {
    try {
        // FIX: Parse JSON body, not FormData
        const { fileName, fileData } = JSON.parse(event.body); 
        if (!fileName || !fileData) return err(400, { message: 'Missing fileName or fileData (base64).' });
        
        const userId = event.requestContext.authorizer.claims.sub; // Correct User ID
        const fileBuffer = Buffer.from(fileData, 'base64'); // Decode base64
        const CHUNK_SIZE = 4 * 1024 * 1024;
        
        const chunkHashes = [];
        const processingPromises = [];

        for (let i = 0; i < fileBuffer.length; i += CHUNK_SIZE) {
            const chunk = fileBuffer.slice(i, i + CHUNK_SIZE);
            const compressedChunk = zlib.gzipSync(chunk);
            const chunkHash = crypto.createHash('sha256').update(compressedChunk).digest('hex');
            chunkHashes.push(chunkHash);
            processingPromises.push(processChunk(chunkHash, compressedChunk));
        }

        await Promise.all(processingPromises);

        const fileId = uuidv4();
        await dynamoDB.send(new PutItemCommand({
            TableName: FILES_TABLE,
            Item: {
                userId: { S: userId },
                fileId: { S: fileId },
                fileName: { S: fileName },
                chunkHashes: { L: chunkHashes.map(h => ({ S: h })) },
                originalSize: { N: fileBuffer.length.toString() },
                uploadDate: { S: new Date().toISOString() },
                version: { N: '1' }
            },
        }));

        return ok({ message: "File uploaded successfully!", fileId: fileId });
    } catch (error) {
        console.error("Upload error:", error);
        return err(500, { message: "Error processing file.", error: error.message });
    }
};

async function processChunk(chunkHash, compressedChunk) {
    const getChunkParams = { TableName: CHUNKS_TABLE, Key: { chunkHash: { S: chunkHash } } };
    const existingChunk = await dynamoDB.send(new GetItemCommand(getChunkParams));

    if (existingChunk.Item) {
        await dynamoDB.send(new UpdateItemCommand({
            TableName: CHUNKS_TABLE,
            Key: { chunkHash: { S: chunkHash } },
            UpdateExpression: 'SET refCount = if_not_exists(refCount, :zero) + :inc',
            ExpressionAttributeValues: { ':inc': { N: '1' }, ':zero': { N: '0' } },
        }));
    } else {
        await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: `chunks/${chunkHash}`, Body: compressedChunk, ContentEncoding: 'gzip' }));
        try {
            await dynamoDB.send(new PutItemCommand({
                TableName: CHUNKS_TABLE,
                Item: {
                    chunkHash: { S: chunkHash },
                    refCount: { N: '1' },
                    size: { N: compressedChunk.length.toString() },
                },
                ConditionExpression: "attribute_not_exists(chunkHash)",
            }));
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') {
                // If it's not a race condition, re-throw
                throw error;
            }
            // If it is a race condition, another process just uploaded it. Increment refCount.
            await dynamoDB.send(new UpdateItemCommand({
                TableName: CHUNKS_TABLE,
                Key: { chunkHash: { S: chunkHash } },
                UpdateExpression: 'SET refCount = if_not_exists(refCount, :zero) + :inc',
                ExpressionAttributeValues: { ':inc': { N: '1' }, ':zero': { N: '0' } },
            }));
        }
    }
}