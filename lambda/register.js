// lambda/register.js
const { CognitoIdentityProviderClient, SignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});
const { ok, err } = require('./cors');

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);
        if (!email || !password) return err(400, { message: 'Missing email or password' });
        const params = {
            ClientId: process.env.COGNITO_CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [{ Name: "email", Value: email }]
        };
        await cognito.send(new SignUpCommand(params));
        return ok({ message: 'Registered successfully. Please check your email for a confirmation code.' });
    } catch (err) {
        return err(400, { message: err.message, name: err.name });
    }
};