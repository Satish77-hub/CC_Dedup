// lambda/listFiles.js
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { unmarshall } = require("@aws-sdk/util-dynamodb"); // Helper to convert DynamoDB JSON to regular JSON
const { ok, err } = require('./cors');
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;

exports.handler = async (event) => {
    try {
        const userId = event.requestContext.authorizer.claims.sub; // Correct User ID
        if (!userId) return err(401, { message: 'Unauthorized' });

        const params = {
            TableName: FILES_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': { S: userId } }
        };

    const { Items } = await dynamoDB.send(new QueryCommand(params));
        
        // Convert DynamoDB's format to clean, normal JSON for the frontend
        const files = Items.map(item => unmarshall(item)); 
        return ok(files);
    } catch (error) {
        console.error("Error fetching files:", error);
        return err(500, { message: "Could not fetch files.", error: error.message });
    }
};