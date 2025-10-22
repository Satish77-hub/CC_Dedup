// lambda/login.js
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);
        if (!email || !password) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing email or password' }) };
        }
        const params = {
            ClientId: process.env.COGNITO_CLIENT_ID,
            AuthFlow: 'USER_PASSWORD_AUTH',
            AuthParameters: { USERNAME: email, PASSWORD: password }
        };
        const { AuthenticationResult } = await cognito.send(new InitiateAuthCommand(params));
        return { 
            statusCode: 200, 
            body: JSON.stringify({ token: AuthenticationResult.IdToken }) 
        };
    } catch (err) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: err.message, name: err.name }) 
        };
    }
};