const { ActivityHandler } = require('botbuilder');

class TeamsBot extends ActivityHandler {
  constructor() {
    super();

    // Event handler for messages received from Teams
    this.onMessage(async (context, next) => {
      // Clean up the text input from Teams (remove any @mentions if present)
      let text = context.activity.text ? context.activity.text.trim() : '';

      // Remove bot mention markup if bot is @mentioned in group/channel chats
      const botMentionRegex = new RegExp(`<at>${context.activity.recipient.name}</at>`, 'gi');
      text = text.replace(botMentionRegex, '').trim();

      if (text) {
        try {
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:3005/chat';

          // Forward user's Teams message to the existing Express backend
          const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: text })
          });

          if (!response.ok) {
            throw new Error(`Backend request failed with status: ${response.status}`);
          }

          const data = await response.json();

          // Send the backend reply back to Teams conversation
          await context.sendActivity(data.reply);
        } catch (error) {
          console.error('[Teams Bot] Error connecting to backend:', error);
          await context.sendActivity('Sorry, I am having trouble connecting to my backend service. Please make sure the main server is running.');
        }
      }

      // Ensure next handler is run
      await next();
    });

    // Event handler for when users join the conversation
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      const welcomeText = 'Hello! I am the AI Employee Assistant. Ask me questions about employee headcount, departments, salaries, or specific profiles.';

      for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
        if (membersAdded[cnt].id !== context.activity.recipient.id) {
          await context.sendActivity(welcomeText);
        }
      }
      await next();
    });
  }
}

module.exports = { TeamsBot };
