const express = require('express');
require('dotenv').config();

const {
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  CloudAdapter
} = require('botbuilder');

const { TeamsBot } = require('./bot');

// Create Express HTTP server for Bot Framework messages
const server = express();
const PORT = process.env.BOT_PORT || 3978;

// Use JSON middleware to parse incoming Bot Framework request payloads
server.use(express.json());

// Initialize credentials factory using Microsoft App variables from .env
const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: process.env.MicrosoftAppId,
  MicrosoftAppPassword: process.env.MicrosoftAppPassword,
  MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
  MicrosoftAppType: process.env.MicrosoftAppType || 'SingleTenant'
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

// Create the CloudAdapter that handles communication with Azure Bot Service / Microsoft Teams
const adapter = new CloudAdapter(botFrameworkAuthentication);

// Catch-all for unhandled adapter turn errors
adapter.onTurnError = async (context, error) => {
  console.error(`\n [Teams Bot Server Error] Unhandled error: ${error}`);
  
  // Send a trace to the emulator/logs
  try {
    await context.sendTraceActivity(
      'OnTurnError Trace',
      `${error}`,
      'https://www.botframework.com/schemas/error',
      'TurnError'
    );
  } catch (traceError) {
    console.error('Failed to send trace activity:', traceError);
  }

  // Inform the user on Teams
  await context.sendActivity('The bot encountered an error or bug during processing.');
};

// Instantiate our Teams Bot
const bot = new TeamsBot();

// Register the API endpoint where Microsoft Teams/Azure Bot Service will forward activities
server.post('/api/messages', async (req, res) => {
  try {
    await adapter.process(req, res, (context) => bot.run(context));
  } catch (err) {
    console.error('Error processing Teams activity:', err);
    res.status(500).send('Error processing activity');
  }
});

// Start the server
server.listen(PORT, () => {
  console.log(`\n[Teams Bot Server] Running on http://localhost:${PORT}`);
  console.log(`[Teams Bot Server] Endpoint: http://localhost:${PORT}/api/messages`);
});
