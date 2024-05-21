import dotenv from 'dotenv';
dotenv.config();

// API key
const apiKey = process.env.OPENAI_API_KEY;


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'POLICY_TEXT_PRIVACYPOLICY' || message.type === 'POLICY_TEXT_TERMSOFSERVICE') {
    const textContent = message.data;
    const currentUrl = new URL(sender.tab.url).origin;
    const storageKey = message.type === 'POLICY_TEXT_PRIVACYPOLICY' ? `summarizedPolicy_${currentUrl}` : `summarizedTerms_${currentUrl}`;

    console.log(`Received ${message.type.toLowerCase()} content:`, textContent);

    // Check local storage first
    chrome.storage.local.get([storageKey], (result) => {
      if (result[storageKey]) {
        console.log(`Loaded cached ${message.type.toLowerCase()} content:`, result[storageKey]);
        sendResponse({ status: 'success', data: result[storageKey] });
      } else {
        // Use ChatGPT API to summarize text
        summarizeText(textContent).then(summarizedText => {
          console.log(`Summarized ${message.type.toLowerCase()} content:`, summarizedText);

          // Calculate privacy score
          const privacyScore = calculatePrivacyScore(summarizedText);
          console.log(`Calculated privacy score: ${privacyScore}`);

          // Store data securely
          const data = {};
          data[storageKey] = summarizedText;
          data[`privacyScore_${currentUrl}`] = privacyScore;
          chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
              console.error(chrome.runtime.lastError);
            }
            sendResponse({ status: 'success', data: summarizedText, score: privacyScore });
          });
        }).catch(err => {
          console.error(`Error summarizing ${message.type.toLowerCase()} content:`, err);
          sendResponse({ status: 'error', message: err.message });
        });
      }
    });

    return true; // Indicates that the response will be sent asynchronously
  } else if (message.type === 'FETCH_URL_CONTENT') {
    const { url } = message;

    fetch(url)
      .then(response => response.text())
      .then(html => {
        sendResponse({ status: 'success', data: html });
      })
      .catch(error => {
        console.error(`Error fetching content from URL: ${url}`, error);
        sendResponse({ status: 'error', message: error.message });
      });

    return true; // Indicates that the response will be sent asynchronously
  }
});

async function summarizeText(text) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: `Summarize the following text:\n${text}` }
        ],
        max_tokens: 500
      })
    });

    const data = await response.json();
    if (response.ok) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error(data.error.message || 'Error summarizing text');
    }
  } catch (error) {
    console.error('Error calling ChatGPT API:', error);
    throw error;
  }
}

function calculatePrivacyScore(text) {
  let score = 100;
  const negativeKeywords = [
    'third-party', 'data sharing', 'personal information', 'cookies', 'tracking', 'data collection',
    'marketing', 'advertising', 'sell', 'transfer', 'disclose', 'opt-out', 'consent'
  ];

  for (const keyword of negativeKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score -= 10; // Deduct points for each occurrence of a negative keyword
    }
  }

  return score;
}

function saveUserConsent(site, consent) {
  chrome.storage.local.get('userConsents', (data) => {
    const userConsents = data.userConsents || {};
    userConsents[site] = consent;
    chrome.storage.local.set({ userConsents }, () => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
      }
    });
  });
}

function getUserConsent(site, callback) {
  chrome.storage.local.get('userConsents', (data) => {
    const userConsents = data.userConsents || {};
    callback(userConsents[site]);
  });
}

// Function to check and extract content for the current tab
function checkAndExtractContent(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (tab.url) {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['dist/content.bundle.js'], // Ensure this path is correct
      });
    }
  });
}

// Listen for tab changes
chrome.tabs.onActivated.addListener((activeInfo) => {
  checkAndExtractContent(activeInfo.tabId);
});

// Listen for URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    checkAndExtractContent(tabId);
  }
});
