// lambda/share.js
const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;

exports.handler = async (event) => {
    try {
        const fileId = event.pathParameters?.fileId;
        const { shareWithUserId } = JSON.parse(event.body);
        const ownerUserId = event.requestContext.authorizer.claims.sub;
        if (!ownerUserId) return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
        if (!fileId || !shareWithUserId) return { statusCode: 400, body: JSON.stringify({ message: 'Missing fileId or shareWithUserId' }) };

        const { Item } = await dynamoDB.send(new GetItemCommand({
            TableName: FILES_TABLE,
            Key: { userId: { S: ownerUserId }, fileId: { S: fileId } }
        }));

        if (!Item) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden: You are not the owner of this file.' }) };
        }

        await dynamoDB.send(new UpdateItemCommand({
            TableName: FILES_TABLE,
            Key: { userId: { S: ownerUserId }, fileId: { S: fileId } },
            UpdateExpression: 'ADD sharedWith :u',
            ExpressionAttributeValues: {
                ':u': { SS: [shareWithUserId] } // Use DynamoDB Set type for list of shared users
            }
        }));

        return { statusCode: 200, body: JSON.stringify({ message: 'File shared successfully.' }) };
    } catch (err) {
        console.error('Share error:', err);
        return { statusCode: 500, body: JSON.stringify({ message: 'Could not share file', error: err.message }) };
    }
};