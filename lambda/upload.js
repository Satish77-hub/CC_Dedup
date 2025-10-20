const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const zlib = require('zlib');

const s3 = new S3Client({});
const dynamoDB = new DynamoDBClient({});

const FILES_TABLE = process.env.FILES_TABLE_NAME;
const CHUNKS_TABLE = process.env.CHUNKS_TABLE_NAME;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

exports.handler = async (event) => {
    try {
        const { fileName, fileData } = JSON.parse(event.body);
        const userId = event.requestContext.authorizer.claims.sub; // CORRECT way to get user ID
        const fileBuffer = Buffer.from(fileData, 'base64');
        const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB
        
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
        const putFileParams = {
            TableName: FILES_TABLE,
            Item: {
                userId: { S: userId },
                fileId: { S: fileId },
                fileName: { S: fileName },
                chunkHashes: { L: chunkHashes.map(h => ({ S: h })) },
                originalSize: { N: fileBuffer.length.toString() },
                uploadDate: { S: new Date().toISOString() },
                version: { N: '1' } // Initial version
            },
        };

        await dynamoDB.send(new PutItemCommand(putFileParams));

        return { statusCode: 200, body: JSON.stringify({ message: "File uploaded successfully!", fileId: fileId }) };
    } catch (error) {
        console.error("Upload error:", error);
        return { statusCode: 500, body: JSON.stringify({ message: "Error processing file.", error: error.message }) };
    }
};

async function processChunk(chunkHash, compressedChunk) {
    const getChunkParams = { TableName: CHUNKS_TABLE, Key: { chunkHash: { S: chunkHash } } };
    const existingChunk = await dynamoDB.send(new GetItemCommand(getChunkParams));

    if (existingChunk.Item) {
        const updateParams = {
            TableName: CHUNKS_TABLE,
            Key: { chunkHash: { S: chunkHash } },
            UpdateExpression: 'ADD refCount :inc',
            ExpressionAttributeValues: { ':inc': { N: '1' } },
        };
        await dynamoDB.send(new UpdateItemCommand(updateParams));
    } else {
        const s3Key = `chunks/${chunkHash}`;
        const s3Params = { Bucket: BUCKET_NAME, Key: s3Key, Body: compressedChunk, ContentEncoding: 'gzip' };
        await s3.send(new PutObjectCommand(s3Params));

        const putChunkParams = {
            TableName: CHUNKS_TABLE,
            Item: {
                chunkHash: { S: chunkHash },
                refCount: { N: '1' },
                size: { N: compressedChunk.length.toString() },
            },
            ConditionExpression: "attribute_not_exists(chunkHash)",
        };
        try {
            await dynamoDB.send(new PutItemCommand(putChunkParams));
        } catch (error) {
            if (error.name !== 'ConditionalCheckFailedException') throw error;
        }
    }
}