const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const dynamoDB = new DynamoDBClient({});
const FILES_TABLE = process.env.FILES_TABLE_NAME;

exports.handler = async (event) => {
    try {
        const userId = event.requestContext.authorizer.claims.sub; // CORRECT way to get user ID
        const params = {
            TableName: FILES_TABLE,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: { ':userId': { S: userId } }
        };

        const data = await dynamoDB.send(new QueryCommand(params));
        
        // Convert DynamoDB format to clean JSON for the frontend
        const files = data.Items.map(item => ({
            fileId: item.fileId.S,
            fileName: item.fileName.S,
            version: item.version.N,
            uploadDate: item.uploadDate.S
        }));

        return { statusCode: 200, body: JSON.stringify(files) };
    } catch (error) {
        console.error("Error fetching files:", error);
        return { statusCode: 500, body: JSON.stringify({ message: "Could not fetch files."}) };
    }
};