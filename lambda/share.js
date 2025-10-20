// lambda/share.js

const { DynamoDBClient, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;

exports.handler = async (event) => {
    try {
        const fileId = event.pathParameters.fileId;
        const { shareWithUserId } = JSON.parse(event.body); // The ID of the user to share with
        const ownerUserId = event.requestContext.authorizer.claims.sub; // The person doing the sharing

        // First, verify the person sharing is the actual owner of the file.
        const getParams = {
            TableName: FILES_TABLE,
            Key: {
                userId: { S: ownerUserId },
                fileId: { S: fileId }
            }
        };

        const { Item } = await dynamoDB.send(new GetItemCommand(getParams));

        if (!Item) {
            return { statusCode: 403, body: JSON.stringify({ message: 'Forbidden: You are not the owner of this file.' }) };
        }

        // Add the new user's ID to the 'sharedWith' set in DynamoDB.
        // Using a Set (SS) automatically handles duplicates.
        const updateParams = {
            TableName: FILES_TABLE,
            Key: {
                userId: { S: ownerUserId },
                fileId: { S: fileId }
            },
            UpdateExpression: 'ADD sharedWith :user',
            ExpressionAttributeValues: {
                ':user': { SS: [shareWithUserId] }
            }
        };

        await dynamoDB.send(new UpdateItemCommand(updateParams));

        return { statusCode: 200, body: JSON.stringify({ message: 'File shared successfully.' }) };

    } catch (error) {
        console.error("Sharing error:", error);
        return { statusCode: 500, body: JSON.stringify({ message: 'Could not share file.' }) };
    }
};