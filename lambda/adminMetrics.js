// lambda/adminMetrics.js

const { DynamoDBClient, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { CognitoIdentityProviderClient, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

const dynamoDB = new DynamoDBClient({});
const cognito = new CognitoIdentityProviderClient({});
const cw = new CloudWatchClient({});

const FILES_TABLE = process.env.FILES_TABLE_NAME;
const CHUNKS_TABLE = process.env.CHUNKS_TABLE_NAME;
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

exports.handler = async (event) => {
    // 1. Authorization Check
    const userGroups = event.requestContext.authorizer?.claims['cognito:groups'];
    if (!userGroups || !userGroups.includes('Admins')) {
        return {
            statusCode: 403,
            body: JSON.stringify({ message: 'Unauthorized. Admin access required.' }),
        };
    }

    try {
        // 2. Fetch data from Cognito and DynamoDB concurrently
        const usersPromise = cognito.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
        const filesDataPromise = dynamoDB.send(new ScanCommand({ TableName: FILES_TABLE }));
        const chunksDataPromise = dynamoDB.send(new ScanCommand({ TableName: CHUNKS_TABLE }));

        const [usersResponse, filesData, chunksData] = await Promise.all([usersPromise, filesDataPromise, chunksDataPromise]);

        // 3. Process Users into a Map for efficient lookup
        const userMap = new Map();
        usersResponse.Users.forEach(user => {
            const userIdSub = user.Attributes.find(attr => attr.Name === 'sub')?.Value;
            if (userIdSub) {
                 userMap.set(userIdSub, {
                    userId: userIdSub,
                    email: user.Attributes.find(attr => attr.Name === 'email')?.Value || user.Username,
                    createdDate: user.UserCreateDate,
                    status: user.UserStatus,
                    totalOriginalSize: 0,
                    fileCount: 0
                });
            }
        });

        // 4. Calculate Per-User and Total Metrics
        let totalOriginalSizeAllUsers = 0;
        filesData.Items.forEach(item => {
            const originalSize = parseInt(item.originalSize?.N) || 0;
            const itemUserId = item.userId?.S;
            totalOriginalSizeAllUsers += originalSize;

            if (itemUserId && userMap.has(itemUserId)) {
                const user = userMap.get(itemUserId);
                user.totalOriginalSize += originalSize;
                user.fileCount += 1;
            }
        });

        const totalStoredSize = chunksData.Items.reduce((sum, item) => sum + (parseInt(item.size?.N) || 0), 0);
        const totalSavedSize = Math.max(0, totalOriginalSizeAllUsers - totalStoredSize);

        // 5. Send Metric to CloudWatch
        try {
            await cw.send(new PutMetricDataCommand({
                MetricData: [{ MetricName: 'StorageSavedBytes', Value: totalSavedSize, Unit: 'Bytes' }],
                Namespace: 'DeduplicationApp'
            }));
        } catch (cwError) {
            console.error("Failed to send metric to CloudWatch:", cwError);
        }

        // 6. Format and Return Data
        const usersArray = Array.from(userMap.values());
        const responsePayload = {
            users: usersArray.map(u => ({
                 email: u.email,
                 userId: u.userId,
                 fileCount: u.fileCount,
                 totalOriginalSizeMB: (u.totalOriginalSize / 1024 / 1024).toFixed(2),
                 status: u.status,
                 createdDate: u.createdDate
            })).sort((a, b) => (a.email || '').localeCompare(b.email || '')),
            summary: {
                totalFiles: filesData.Items.length,
                totalUsers: usersArray.length,
                totalOriginalMB: (totalOriginalSizeAllUsers / 1024 / 1024).toFixed(2),
                totalStoredMB: (totalStoredSize / 1024 / 1024).toFixed(2),
                savedMB: (totalSavedSize / 1024 / 1024).toFixed(2)
            }
        };

        return {
            statusCode: 200,
            body: JSON.stringify(responsePayload)
        };

    } catch (error) {
        console.error("Error calculating admin metrics:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal server error calculating metrics.", error: error.message })
        };
    }
};