// lambda/register.js
const { CognitoIdentityProviderClient, SignUpCommand } = require('@aws-sdk/client-cognito-identity-provider');
const cognito = new CognitoIdentityProviderClient({});

exports.handler = async (event) => {
    try {
        const { email, password } = JSON.parse(event.body);
        if (!email || !password) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing email or password' }) };
        }
        const params = {
            ClientId: process.env.COGNITO_CLIENT_ID,
            Username: email,
            Password: password,
            UserAttributes: [{ Name: "email", Value: email }]
        };
        await cognito.send(new SignUpCommand(params));
        return { 
            statusCode: 200, 
            body: JSON.stringify({ message: 'Registered successfully. Please check your email for a confirmation code.' }) 
        };
    } catch (err) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ message: err.message, name: err.name }) 
        };
    }
};