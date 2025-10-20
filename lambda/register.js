// lambda/register.js
const { CognitoIdentityProviderClient, SignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    const { email, password } = JSON.parse(event.body);
    const params = {
        // FIX: Use the environment variable passed from template.yaml
        ClientId: process.env.COGNITO_CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }]
    };
    try {
        await cognito.send(new SignUpCommand(params));
        return { statusCode: 200, body: 'Registered successfully. Please check your email for a confirmation code.' };
    } catch (err) {
        return { statusCode: 400, body: err.message };
    }
};