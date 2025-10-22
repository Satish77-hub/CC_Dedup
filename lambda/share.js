// lambda/share.js
const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;
const { ok, err } = require('./cors');

exports.handler = async (event) => {
    try {
        const fileId = event.pathParameters?.fileId;
        const { shareWithUserId } = JSON.parse(event.body);
    const ownerUserId = event.requestContext.authorizer.claims.sub;
    if (!ownerUserId) return err(401, { message: 'Unauthorized' });
    if (!fileId || !shareWithUserId) return err(400, { message: 'Missing fileId or shareWithUserId' });

        const { Item } = await dynamoDB.send(new GetItemCommand({
            TableName: FILES_TABLE,
            Key: { userId: { S: ownerUserId }, fileId: { S: fileId } }
        }));

        if (!Item) return err(403, { message: 'Forbidden: You are not the owner of this file.' });

        await dynamoDB.send(new UpdateItemCommand({
            TableName: FILES_TABLE,
            Key: { userId: { S: ownerUserId }, fileId: { S: fileId } },
            UpdateExpression: 'ADD sharedWith :u',
            ExpressionAttributeValues: {
                ':u': { SS: [shareWithUserId] } // Use DynamoDB Set type for list of shared users
            }
        }));

        return ok({ message: 'File shared successfully.' });
    } catch (err) {
        console.error('Share error:', err);
        return err(500, { message: 'Could not share file', error: err.message });
    }
};