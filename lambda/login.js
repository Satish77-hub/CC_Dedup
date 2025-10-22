// lambda/login.js
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});
const { ok, err } = require('./cors');

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);
        if (!email || !password) return err(400, { message: 'Missing email or password' });
        const params = {
            ClientId: process.env.COGNITO_CLIENT_ID,
            AuthFlow: 'USER_PASSWORD_AUTH',
            AuthParameters: { USERNAME: email, PASSWORD: password }
        };
        const { AuthenticationResult } = await cognito.send(new InitiateAuthCommand(params));
        return ok({ token: AuthenticationResult.IdToken });
    } catch (err) {
        return err(400, { message: err.message, name: err.name });
    }
};