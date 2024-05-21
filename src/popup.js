document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    const site = new URL(currentTab.url).origin;

    const summarizedPolicyKey = `summarizedPolicy_${site}`;
    const summarizedTermsKey = `summarizedTerms_${site}`;
    const privacyScoreKey = `privacyScore_${site}`;

    chrome.storage.local.get([summarizedPolicyKey, summarizedTermsKey, privacyScoreKey], (result) => {
      console.log('Retrieved summarized policy:', result[summarizedPolicyKey]);
      console.log('Retrieved summarized terms:', result[summarizedTermsKey]);
      console.log('Retrieved privacy score:', result[privacyScoreKey]);

      document.getElementById('policy-summary').innerText = result[summarizedPolicyKey] || 'No policy text found.';
      document.getElementById('terms-summary').innerText = result[summarizedTermsKey] || 'No terms text found.';
      const privacyScore = result[privacyScoreKey] !== undefined ? result[privacyScoreKey] : 'No score available.';
      document.getElementById('privacy-score').innerText = privacyScore;
      if (privacyScore !== 'No score available.') {
        document.getElementById('privacy-score').style.color = privacyScore < 50 ? 'red' : 'green';
        document.getElementById('privacy-message').innerText = privacyScore < 50 ? 'Warning: Poor Privacy Practices' : 'Privacy Policy is Good';
        document.getElementById('privacy-message').style.color = privacyScore < 50 ? 'red' : 'green';
      } else {
        document.getElementById('privacy-message').innerText = 'No privacy score available.';
      }
    });

    document.getElementById('summarize-policy-url').addEventListener('click', () => {
      const url = document.getElementById('manual-policy-url').value;
      if (url) {
        fetchUrlContent(url, site);
      } else {
        alert('Please enter a valid URL.');
      }
    });
  });
});

// Download the summary
function downloadSummary(key, filename) {
  chrome.storage.local.get([key], (result) => {
    const summaryText = result[key];
    if (summaryText) {
      const blob = new Blob([summaryText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      alert('No summary available to download.');
    }
  });
}

function fetchUrlContent(url, site) {
  chrome.runtime.sendMessage({
    type: 'FETCH_URL_CONTENT',
    url: url
  }, (response) => {
    if (response.status === 'success') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(response.data, 'text/html');
      let mainContent = findMainContent(doc);
      if (!mainContent) {
        mainContent = doc.body.innerText;
      }
      const sanitizedContent = sanitize(mainContent);
      summarizeText(sanitizedContent).then(summarizedText => {
        document.getElementById('policy-summary').innerText = summarizedText;

        // Calculate privacy score
        const privacyScore = calculatePrivacyScore(summarizedText);
        document.getElementById('privacy-score').innerText = privacyScore;
        document.getElementById('privacy-score').style.color = privacyScore < 50 ? 'red' : 'green';
        document.getElementById('privacy-message').innerText = privacyScore < 50 ? 'Warning: Poor Privacy Practices' : 'Privacy Policy is Good';
        document.getElementById('privacy-message').style.color = privacyScore < 50 ? 'red' : 'green';

        // Store summarized text and privacy score
        const storageKey = `summarizedPolicy_${site}`;
        const scoreKey = `privacyScore_${site}`;
        const data = {};
        data[storageKey] = summarizedText;
        data[scoreKey] = privacyScore;
        chrome.storage.local.set(data, () => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          }
        });
      }).catch(err => {
        console.error(`Error summarizing content: ${err.message}`);
        alert('Error summarizing content. Please check the console for more details.');
      });
    } else {
      console.error(`Error fetching URL content: ${response.message}`);
      alert(`Error fetching URL content: ${response.message}`);
    }
  });
}

async function summarizeText(text) {
  const apiKey = 'apikey';  // Replace with your actual API key
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
    console.log('API response:', data); // Log the entire response
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

function findMainContent(doc) {
  const commonSelectors = [
    'main', 
    'article', 
    'section',
    'div[class*="content"]', 
    'div[class*="main"]', 
    'div[id*="content"]', 
    'div[id*="main"]'
  ];

  for (const selector of commonSelectors) {
    const element = doc.querySelector(selector);
    if (element) {
      return element.innerText;
    }
  }

  const textHeavyElements = doc.querySelectorAll('p, h1, h2, h3, li');
  let textContent = '';
  textHeavyElements.forEach(el => textContent += el.innerText + '\n');

  return textContent;
}

function sanitize(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

function calculatePrivacyScore(text) {
  let score = 100;
  const highImpactNegativeKeywords = [
    'sell', 'transfer', 'disclose', 'share with third-party', 'third-party marketing', 'data sale', 'profiling'
  ];
  
  const mediumImpactNegativeKeywords = [
    'data sharing', 'tracking', 'cookies', 'data collection', 'advertising', 'opt-out'
  ];
  
  const lowImpactNegativeKeywords = [
    'consent', 'personal information', 'data retention', 'user data'
  ];
  
  const positiveKeywords = [
    'anonymized', 'encrypted', 'user control', 'data protection', 'no third-party sharing', 'opt-in', 'data minimization'
  ];
  
  for (const keyword of highImpactNegativeKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score -= 20; // Deduct 20 points for each high impact negative keyword
    }
  }
  
  for (const keyword of mediumImpactNegativeKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score -= 10; // Deduct 10 points for each medium impact negative keyword
    }
  }
  
  for (const keyword of lowImpactNegativeKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score -= 5; // Deduct 5 points for each low impact negative keyword
    }
  }
  
  for (const keyword of positiveKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      score += 5; // Add 5 points for each positive keyword
    }
  }

  return Math.max(score, 0); // Ensure the score doesn't go below 0
}
