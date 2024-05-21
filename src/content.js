// Extracting the policy text
function extractPolicyText() {
  const privacyPolicyKeywords = [
    'privacy', 'policy', 'data protection', 'cookie', 'gdpr', 'ccpa', 'california consumer privacy act',
    'personal information', 'confidentiality', 'data privacy'
  ];
  const termsOfServiceKeywords = [
    'terms', 'conditions', 'use', 'service', 'agreement', 'license', 'terms of use', 'terms of service',
    'legal', 'user agreement', 'acceptable use'
  ];

  const allLinks = document.querySelectorAll('a');

  let privacyPolicy = findLink(allLinks, privacyPolicyKeywords);
  let termsOfService = findLink(allLinks, termsOfServiceKeywords);

  if (privacyPolicy) {
    console.log(`Found privacy policy link: ${privacyPolicy.href}`);
    fetchAndExtractContent(privacyPolicy.href, 'privacyPolicy');
  } else {
    console.log('Privacy policy not found in HTML. Trying sitemap...');
    fetchSitemapAndExtractContent('privacyPolicy', privacyPolicyKeywords);
  }

  if (termsOfService) {
    console.log(`Found terms of service link: ${termsOfService.href}`);
    fetchAndExtractContent(termsOfService.href, 'termsOfService');
  } else {
    console.log('Terms of service not found in HTML. Trying sitemap...');
    fetchSitemapAndExtractContent('termsOfService', termsOfServiceKeywords);
  }
}

// finding the link of the policy
function findLink(links, keywords) {
  for (let link of links) {
    let linkText = link.innerText.toLowerCase();
    let href = link.href.toLowerCase();

    if (keywords.some(keyword => linkText.includes(keyword) || href.includes(keyword))) {
      return link;
    }
  }
  return null;
}

// fetch the policy content form the url
function fetchAndExtractContent(url, type) {
  fetch(url)
    .then(response => response.text())
    .then(html => {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      let mainContent = findMainContent(doc);

      if (!mainContent) {
        mainContent = doc.body.innerText;
      }

      const sanitizedContent = sanitize(mainContent);

      console.log(`Extracted ${type} content:`, sanitizedContent);

      chrome.runtime.sendMessage({ type: `POLICY_TEXT_${type.toUpperCase()}`, data: sanitizedContent });
    })
    .catch(error => console.error(`Error fetching ${type} content:`, error));
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

function fetchSitemapAndExtractContent(type, keywords) {
  const sitemapUrl = `${window.location.origin}/sitemap.xml`;

  fetch(sitemapUrl)
    .then(response => {
      if (response.ok) {
        return response.text();
      }
      throw new Error('Sitemap not found');
    })
    .then(xml => {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xml, 'application/xml');
      const urls = xmlDoc.getElementsByTagName('url');

      for (let url of urls) {
        const loc = url.getElementsByTagName('loc')[0].textContent.toLowerCase();

        if (keywords.some(keyword => loc.includes(keyword))) {
          console.log(`Found ${type} link in sitemap: ${loc}`);
          fetchAndExtractContent(loc, type);
          return;
        }
      }

      console.log(`${type} not found in sitemap.`);
    })
    .catch(error => console.error(`Error fetching sitemap for ${type}:`, error));
}

// Sanitize user input
function sanitize(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

extractPolicyText();
