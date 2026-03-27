const express = require('express');
const puppeteer = require('puppeteer');
const Fuse = require('fuse.js');

const app = express();
app.use(express.json());

app.post('/ai/nsopw/check', async (req, res) => {
  const { firstName, lastName, state } = req.body;
  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }

  try {
    const result = await Promise.race([
      runScraper(firstName, lastName, state),
      new Promise((resolve) => setTimeout(() => resolve({
        nsopwStatus: 'pending',
        matchFound: false,
        matchDetails: [],
        checkedAt: new Date().toISOString(),
        source: 'nsopw.gov',
      }), 15000))
    ]);

    res.json(result);
  } catch (err) {
    // Return pending on any unhandled error as per requirements
    res.json({
      nsopwStatus: 'pending',
      matchFound: false,
      matchDetails: [],
      checkedAt: new Date().toISOString(),
      source: 'nsopw.gov'
    });
  }
});

async function runScraper(firstName, lastName, state) {
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    
    // Safety net within puppeteer script
    await page.setDefaultNavigationTimeout(13000); 

    await page.goto('https://www.nsopw.gov/search/', { waitUntil: 'networkidle2' });

    // Wait for the form to appear. Based on NSOPW structure, it might have specific IDs.
    // If exact IDs change, we try to use common selectors
    await page.waitForSelector('input[name="FirstName"]', { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('form', { timeout: 2000 }).catch(() => {});
    
    // Evaluate in browser to fill form
    await page.evaluate((fn, ln, st) => {
      const firstInput = document.querySelector('input[name="FirstName"], input[id*="first"]') || document.querySelector('input[placeholder*="First"]');
      const lastInput = document.querySelector('input[name="LastName"], input[id*="last"]') || document.querySelector('input[placeholder*="Last"]');
      
      if (firstInput) firstInput.value = fn;
      if (lastInput) lastInput.value = ln;
      
      if (st) {
        const stateSelect = document.querySelector('select[name="Jurisdiction"], select[id*="state"]');
        if (stateSelect) {
          Array.from(stateSelect.options).forEach((opt, idx) => {
            if (opt.text.toLowerCase().includes(st.toLowerCase()) || opt.value.toLowerCase() === st.toLowerCase()) {
              stateSelect.selectedIndex = idx;
            }
          });
        }
      }
      
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], .search-btn');
      if (submitBtn) submitBtn.click();
      else {
        const form = document.querySelector('form');
        if (form) form.submit();
      }
    }, firstName, lastName, state);

    // Wait for either results table or "no results" element
    await Promise.race([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => {}),
      page.waitForSelector('table', { timeout: 5000 }).catch(() => {}),
      page.waitForFunction(() => document.body.innerText.toLowerCase().includes('0 offenders') || document.body.innerText.toLowerCase().includes('no results'), { timeout: 5000 }).catch(() => {})
    ]);

    // Extract table rows
    const results = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tr, .search-result-row');
      const extracted = [];
      rows.forEach(row => {
        const text = row.innerText || '';
        if (text.trim().length > 0) {
          extracted.push(text);
        }
      });
      return extracted;
    });

    await browser.close();

    const noRecords = results.length === 0 || results.some(r => r.toLowerCase().includes('0 offenders') || r.toLowerCase().includes('no results') || r.toLowerCase().includes('no records'));

    if (noRecords) {
      return {
        nsopwStatus: 'pass',
        matchFound: false,
        matchDetails: [],
        checkedAt: new Date().toISOString(),
        source: 'nsopw.gov'
      };
    }

    // Fuzzy matching against the input name
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    
    // Parse the extracted rows into objects for fuse.js
    const parsedRecords = results.map(text => {
      return { raw: text, name: text }; // Very simple parsing as table structure may vary
    });

    const options = {
      includeScore: true,
      threshold: 0.4, // Lower is more exact, 0.4 allows some fuzziness
      keys: ['name']
    };

    const fuse = new Fuse(parsedRecords, options);
    const fuzzyResults = fuse.search(fullName);

    const matchFound = fuzzyResults.length > 0;
    const nsopwStatus = matchFound ? 'fail' : 'pass';

    return {
      nsopwStatus,
      matchFound,
      matchDetails: matchFound ? fuzzyResults.map(r => r.item.raw).slice(0, 5) : [],
      checkedAt: new Date().toISOString(),
      source: 'nsopw.gov'
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    throw error;
  }
}

const port = process.env.NSOPW_PORT || 8003;
if (require.main === module) {
  app.listen(port, () => {
    console.log(`NSOPW Scraper Service running on port ${port}`);
  });
}

module.exports = app;
