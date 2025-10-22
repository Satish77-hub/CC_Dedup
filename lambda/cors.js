// lambda/cors.js
// Centralized CORS helpers for all Lambda responses
// Update the origin below to your deployed frontend domain if it changes.

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://main.d179u4xc543bsr.amplifyapp.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Amz-Security-Token,X-Api-Key',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

const ok = (body) => ({ statusCode: 200, headers: corsHeaders, body: JSON.stringify(body) });
const err = (code, body) => ({ statusCode: code, headers: corsHeaders, body: JSON.stringify(body) });

module.exports = { corsHeaders, ok, err };
