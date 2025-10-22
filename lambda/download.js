// lambda/download.js
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const zlib = require('zlib');
const { ok, err } = require('./cors');

const s3 = new S3Client({});
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;
const BUCKET_NAME = process.env.S3_BUCKET_NAME;

exports.handler = async (event) => {
    try {
        const fileId = event.pathParameters?.fileId;
        const userId = event.requestContext.authorizer.claims.sub;
    if (!userId) return err(401, { message: 'Unauthorized' });
    if (!fileId) return err(400, { message: 'Missing fileId' });

        const getParams = {
            TableName: FILES_TABLE,
            Key: { userId: { S: userId }, fileId: { S: fileId } }
        };

        const { Item } = await dynamoDB.send(new GetItemCommand(getParams));
        if (!Item) return err(404, { message: 'File not found or you do not have permission.' });

        const fileItem = unmarshall(Item);
        const chunkHashes = fileItem.chunkHashes || [];
        let fileBuffer = Buffer.alloc(0);

        for (const hash of chunkHashes) {
            const getObjParams = { Bucket: BUCKET_NAME, Key: `chunks/${hash}` };
            const { Body } = await s3.send(new GetObjectCommand(getObjParams));
            const compressedChunk = await Body.transformToByteArray();
            const decompressedChunk = zlib.gunzipSync(compressedChunk);
            fileBuffer = Buffer.concat([fileBuffer, decompressedChunk]);
        }

        // Re-upload the reconstructed file to a temporary location
        const tempKey = `temp-downloads/${userId}/${fileId}`;
        await s3.send(new PutObjectCommand({ 
            Bucket: BUCKET_NAME, 
            Key: tempKey, 
            Body: fileBuffer, 
            ContentType: 'application/octet-stream' 
        }));

        // Generate a pre-signed URL for the temporary file
        const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_NAME, Key: tempKey }), { expiresIn: 60 }); 

        return ok({ downloadUrl: signedUrl });
    } catch (error) {
        console.error("Download error:", error);
        return err(500, { message: "Error generating download link.", error: error.message });
    }
};