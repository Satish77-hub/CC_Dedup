// lambda/login.js
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    const { email, password } = JSON.parse(event.body);
    const params = {
        // FIX: Use the environment variable passed from template.yaml
        ClientId: process.env.COGNITO_CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password }
    };
    try {
        const { AuthenticationResult } = await cognito.send(new InitiateAuthCommand(params));
        return { statusCode: 200, body: JSON.stringify({ token: AuthenticationResult.IdToken }) };
    } catch (err) {
        return { statusCode: 400, body: err.message };
    }
};