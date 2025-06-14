/**
 * Wait using page.evaluate instead of waitForTimeout
 */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

class UnitedFlightSearcher {
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.timeout = options.timeout || 60000;
    this.interceptedData = [];
    this.saveResponses = options.saveResponses !== false;
    this.outputDir = options.outputDir || "./flight_data";

    // Ensure output directory exists
    if (this.saveResponses && !fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  /**
   * Search flights by navigating to a United URL and intercepting API responses
   * @param {string} searchURL - United.com search URL (from URL builder)
   * @param {Object} options - Additional options
   * @returns {Object} Parsed flight data
   */
  async searchByURL(searchURL, options = {}) {
    console.log(`🌐 Navigating to: ${searchURL}`);

    const browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-http2", // Force HTTP/1.1 to avoid ERR_HTTP2_PROTOCOL_ERROR
        "--disable-dev-shm-usage",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ],
      defaultViewport: { width: 1920, height: 1080 },
    });

    try {
      const page = await browser.newPage();

      // Enhanced anti-detection measures
      await this.setupAntiDetection(page);

      // Enable request interception
      await page.setRequestInterception(true);
      this.setupInterception(page, options);

      // Navigate with retry logic
      await this.navigateWithRetry(page, searchURL);

      // Wait for the page to load and potentially trigger searches
      await this.waitForSearchResults(page);

      // Parse and return the intercepted data
      return this.parseInterceptedData(options);
    } finally {
      await browser.close();
    }
  }

  /**
   * Set up anti-detection measures
   */
  async setupAntiDetection(page) {
    // Set realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    // Set additional headers
    await page.setExtraHTTPHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      DNT: "1",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Cache-Control": "max-age=0",
    });

    // Hide webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
      });
    });

    // Mock languages and plugins
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
    });

    // Set viewport and device pixel ratio
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      isLandscape: true,
    });
  }

  /**
   * Wait using page.evaluate instead of waitForTimeout
   */
  async waitFor(page, ms) {
    await page.evaluate((delay) => {
      return new Promise((resolve) => setTimeout(resolve, delay));
    }, ms);
  }

  /**
   * Navigate with retry logic for network errors
   */
  async navigateWithRetry(page, url, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Navigation attempt ${attempt}/${maxRetries}`);

        await page.goto(url, {
          waitUntil: "domcontentloaded", // Changed from networkidle0 to be less strict
          timeout: this.timeout,
        });

        // Wait a bit for dynamic content to load
        await this.waitFor(page, 3000);

        // Check if page loaded successfully
        const title = await page.title();
        if (title && !title.includes("Error")) {
          console.log(`✅ Page loaded successfully: ${title}`);
          return;
        }
      } catch (error) {
        console.log(`⚠️ Navigation attempt ${attempt} failed:`, error.message);

        if (attempt === maxRetries) {
          throw new Error(
            `Failed to navigate after ${maxRetries} attempts: ${error.message}`
          );
        }

        // Wait before retry
        await this.waitFor(page, 2000 * attempt);
      }
    }
  }

  /**
   * Set up request/response interception for United's API
   */
  setupInterception(page, options = {}) {
    let requestCount = 0;
    let failedRequests = [];

    page.on("request", (request) => {
      const url = request.url();

      // Add realistic headers to API requests
      if (url.includes("/api/")) {
        const headers = {
          ...request.headers(),
          Referer: "https://www.united.com/",
          Origin: "https://www.united.com",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/plain, */*",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        };

        request.continue({ headers });
      } else {
        request.continue();
      }

      // Log requests to FetchFlights endpoint
      if (url.includes("/api/flight/FetchFlights")) {
        console.log(`📤 Request ${++requestCount} to FetchFlights:`, url);

        // Optionally log request payload
        if (options.logRequests && request.postData()) {
          console.log("📋 Request payload:", request.postData());
        }
      }
    });

    // Handle request failures
    page.on("requestfailed", (request) => {
      const url = request.url();
      const failure = request.failure();

      if (url.includes("/api/") || url.includes("FetchFlights")) {
        console.log(`❌ Request failed: ${url}`);
        console.log(`❌ Failure reason: ${failure?.errorText || "Unknown"}`);

        failedRequests.push({
          url,
          error: failure?.errorText || "Unknown error",
          timestamp: new Date().toISOString(),
        });
      }
    });

    page.on("response", async (response) => {
      const url = response.url();
      const status = response.status();

      // Log all API responses for debugging
      if (url.includes("/api/")) {
        console.log(`📡 API Response: ${status} - ${url}`);
      }

      // Intercept the specific FetchFlights API endpoint
      if (this.isFetchFlightsAPI(url)) {
        try {
          if (status !== 200) {
            console.log(`⚠️ FetchFlights returned status ${status} for ${url}`);
            return;
          }

          const responseBody = await response.text();

          if (!responseBody || responseBody.trim() === "") {
            console.log(`⚠️ Empty response from FetchFlights: ${url}`);
            return;
          }

          const data = JSON.parse(responseBody);

          console.log(`✅ Intercepted FetchFlights response: ${status}`);
          console.log(
            `📊 Response size: ${(responseBody.length / 1024).toFixed(2)}KB`
          );

          const interceptedItem = {
            url,
            timestamp: new Date().toISOString(),
            status: status,
            headers: response.headers(),
            data: data,
            size: responseBody.length,
          };

          this.interceptedData.push(interceptedItem);

          // Save to file if enabled
          if (this.saveResponses) {
            await this.saveResponseToFile(interceptedItem, options);
          }
        } catch (error) {
          console.log(
            `❌ Failed to parse FetchFlights response from ${url}:`,
            error.message
          );
          console.log(`❌ Response status: ${status}`);

          // Try to log partial response for debugging
          try {
            const partialResponse = await response.text();
            console.log(
              `❌ Partial response: ${partialResponse.substring(0, 200)}...`
            );
          } catch (e) {
            console.log(`❌ Could not read response body: ${e.message}`);
          }
        }
      }
    });

    // Store failed requests for later analysis
    this.failedRequests = failedRequests;
  }

  /**
   * Check if URL is the FetchFlights API endpoint
   */
  isFetchFlightsAPI(url) {
    return (
      url.includes("/api/flight/FetchFlights") ||
      url.includes("FetchFlights") ||
      (url.includes("united.com") && url.includes("/api/flight/"))
    );
  }

  /**
   * Wait for search results to load with better error handling
   */
  async waitForSearchResults(page, maxWait = 60000) {
    console.log("⏳ Waiting for flight search results...");

    const startTime = Date.now();
    let lastDataCount = 0;
    let checkCount = 0;

    while (Date.now() - startTime < maxWait) {
      checkCount++;

      // Check if we've received new data
      if (this.interceptedData.length > lastDataCount) {
        lastDataCount = this.interceptedData.length;
        console.log(
          `📡 Received ${this.interceptedData.length} API response(s)`
        );

        // Wait a bit more for any additional responses
        await this.waitFor(page, 3000);

        // If no new data for 3 seconds, we're probably done
        if (this.interceptedData.length === lastDataCount) {
          console.log("✅ Flight data collection completed");
          return;
        }
      }

      // Every 10 seconds, check page state and try to trigger search if needed
      if (checkCount % 10 === 0) {
        await this.checkPageStateAndRetrigger(page);
      }

      await this.waitFor(page, 1000);
    }

    // If we have failed requests, log them for debugging
    if (this.failedRequests && this.failedRequests.length > 0) {
      console.log(`⚠️ ${this.failedRequests.length} failed requests detected:`);
      this.failedRequests.forEach((req) => {
        console.log(`   - ${req.url}: ${req.error}`);
      });
    }

    if (this.interceptedData.length === 0) {
      throw new Error(
        "No flight data intercepted within timeout period. Check for network errors or anti-bot detection."
      );
    }
  }

  /**
   * Check page state and try to retrigger search if needed
   */
  async checkPageStateAndRetrigger(page) {
    try {
      // Check if there are any error messages on the page
      const errorElements = await page.$(
        '[data-test="error-message"], .error-message, .alert-error'
      );
      if (errorElements.length > 0) {
        console.log("⚠️ Error messages detected on page");

        // Try to get error text
        for (const element of errorElements) {
          try {
            const errorText = await page.evaluate(
              (el) => el.textContent,
              element
            );
            console.log(`   Error: ${errorText}`);
          } catch (e) {
            // Ignore individual element errors
          }
        }
      }

      // Check if search button is still visible (indicates search hasn't been triggered)
      const searchButton = await page.$(
        '[data-test-id="search-button"], button[type="submit"]'
      );
      if (searchButton) {
        console.log(
          "🔄 Search button still visible, attempting to retrigger search..."
        );

        try {
          await searchButton.click();
          await page.waitForTimeout(2000);
          console.log("✅ Search retriggered");
        } catch (e) {
          console.log("⚠️ Could not click search button:", e.message);
        }
      }

      // Check for network status in console
      const consoleLogs = await page.evaluate(() => {
        return window.performance && window.performance.getEntriesByType
          ? window.performance.getEntriesByType("navigation")[0]
          : null;
      });

      if (consoleLogs) {
        console.log(`📊 Page load status: ${consoleLogs.type}`);
      }
    } catch (error) {
      // Don't let page state checking break the main flow
      console.log("⚠️ Error checking page state:", error.message);
    }
  }

  /**
   * Save API response to JSON file
   */
  async saveResponseToFile(interceptedItem, options = {}) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = options.filename || `united_flights_${timestamp}.json`;
      const filepath = path.join(this.outputDir, filename);

      // Create a clean version for saving
      const dataToSave = {
        metadata: {
          url: interceptedItem.url,
          timestamp: interceptedItem.timestamp,
          status: interceptedItem.status,
          size: interceptedItem.size,
          headers: interceptedItem.headers,
        },
        flightData: interceptedItem.data,
      };

      fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
      console.log(`💾 Saved flight data to: ${filepath}`);

      // Also save a simplified version with just the flight data
      const simpleFilename = filename.replace(".json", "_simple.json");
      const simpleFilepath = path.join(this.outputDir, simpleFilename);
      fs.writeFileSync(
        simpleFilepath,
        JSON.stringify(interceptedItem.data, null, 2)
      );
      console.log(`💾 Saved simplified data to: ${simpleFilepath}`);
    } catch (error) {
      console.error("❌ Failed to save response to file:", error.message);
    }
  }

  /**
   * Parse all intercepted data and return structured results
   */
  parseInterceptedData(options = {}) {
    if (this.interceptedData.length === 0) {
      return {
        flights: [],
        error: "No data intercepted",
        metadata: {
          interceptedResponses: 0,
          timestamp: new Date().toISOString(),
        },
      };
    }

    console.log(
      `📋 Parsing ${this.interceptedData.length} intercepted response(s)`
    );

    // Use the latest/largest response (usually the most complete)
    const latestData = this.interceptedData.reduce((prev, current) => {
      return current.size > prev.size ? current : prev;
    });

    const parsedResults = this.extractFlightInfo(latestData.data);

    // Add metadata
    parsedResults.metadata = {
      interceptedResponses: this.interceptedData.length,
      responseTimestamp: latestData.timestamp,
      responseSize: latestData.size,
      apiUrl: latestData.url,
      parseTimestamp: new Date().toISOString(),
    };

    return parsedResults;
  }

  /**
   * Extract flight information from United's API response
   */
  extractFlightInfo(data) {
    const flights = [];

    if (!data || typeof data !== "object") {
      return {
        flights,
        error: "Invalid response data",
        rawData: data,
      };
    }

    try {
      // Handle different response structures
      let trips = [];

      if (data.Trips && Array.isArray(data.Trips)) {
        trips = data.Trips;
      } else if (data.data && data.data.Trips) {
        trips = data.data.Trips;
      } else if (Array.isArray(data)) {
        trips = data;
      }

      for (const trip of trips) {
        if (!trip) continue;

        const flightInfo = {
          tripIndex: trip.TripIndex || trip.Index,
          origin: trip.Origin,
          destination: trip.Destination,
          originDecoded: trip.OriginDecoded,
          destinationDecoded: trip.DestinationDecoded,
          departDate: trip.DepartDate,
          departTime: trip.DepartTime,
          fares: [],
          pricing: [],
          aircraft: [],
          searchFilters: {},
        };

        // Extract fare information
        if (trip.ColumnInformation && trip.ColumnInformation.Columns) {
          flightInfo.fares = trip.ColumnInformation.Columns.map((column) => ({
            type: column.Type,
            description: column.Description,
            fareFamily: column.FareFamily,
            isRefundable: column.IsFullyRefundable || false,
            cabinClass: column.DataSourceLabel?.trim(),
            fareContent: column.FareContentDescription,
            marketingText: column.MarketingText,
          }));
        }

        // Extract pricing information
        if (
          trip.SearchFiltersOut &&
          trip.SearchFiltersOut.AirportsDestinationList
        ) {
          flightInfo.pricing =
            trip.SearchFiltersOut.AirportsDestinationList.map((dest) => ({
              airport: dest.Code,
              description: dest.Description,
              price: parseFloat(dest.Amount) || 0,
              currency: dest.Currency,
              fareFamily: dest.FareFamily,
            }));
        }

        // Extract equipment/aircraft information
        if (trip.SearchFiltersOut && trip.SearchFiltersOut.EquipmentList) {
          flightInfo.aircraft = trip.SearchFiltersOut.EquipmentList.map(
            (eq) => ({
              code: eq.Code,
              description: eq.Description,
            })
          );
        }

        // Extract search filter information
        if (trip.SearchFiltersOut) {
          flightInfo.searchFilters = {
            priceRange: {
              min: trip.SearchFiltersOut.PriceMin,
              max: trip.SearchFiltersOut.PriceMax,
              currency: trip.SearchFiltersOut.PriceMinCurrency,
            },
            duration: {
              min: trip.SearchFiltersOut.DurationMin,
              max: trip.SearchFiltersOut.DurationMax,
            },
            stops: {
              min: trip.SearchFiltersOut.StopCountMin,
              max: trip.SearchFiltersOut.StopCountMax,
            },
            carriers: {
              marketing: trip.SearchFiltersOut.CarriersMarketing,
              operating: trip.SearchFiltersOut.CarriersOperating,
            },
          };
        }

        flights.push(flightInfo);
      }

      return {
        flights,
        searchInfo: {
          sessionId: data.SessionId,
          lastCallDateTime: data.LastCallDateTime,
          warnings: data.Warnings || [],
          errors: data.Errors || [],
          marketingCarriers: data.MarketingCarriers,
          operatingCarriers: data.OperatingCarriers,
          status: data.Status,
          version: data.Version,
        },
        rawData: data,
      };
    } catch (error) {
      console.error("❌ Error parsing flight data:", error.message);
      return {
        flights,
        error: `Failed to parse flight data: ${error.message}`,
        rawData: data,
      };
    }
  }

  /**
   * Get summary statistics from intercepted data including failed requests
   */
  getSummary() {
    return {
      totalResponses: this.interceptedData.length,
      totalDataSize: this.interceptedData.reduce(
        (sum, item) => sum + item.size,
        0
      ),
      responseUrls: this.interceptedData.map((item) => item.url),
      timestamps: this.interceptedData.map((item) => item.timestamp),
      failedRequests: this.failedRequests || [],
      failedRequestCount: (this.failedRequests || []).length,
    };
  }

  /**
   * Alternative search method using form interaction if URL navigation fails
   */
  async searchByFormInteraction(searchParams, options = {}) {
    console.log("🔄 Trying alternative form interaction method...");

    const browser = await puppeteer.launch({
      headless: this.headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-http2",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        `--proxy-server=${proxies[Math.floor(Math.random() * proxies.length)]}`,
      ],
    });

    try {
      const page = await browser.newPage();
      await this.setupAntiDetection(page);
      await page.setRequestInterception(true);
      this.setupInterception(page, options);

      // Navigate to United homepage first
      await page.goto("https://www.united.com", {
        waitUntil: "domcontentloaded",
        timeout: this.timeout,
      });

      await this.waitFor(page, 3000);

      // Fill out the search form manually
      await this.fillSearchFormManually(page, searchParams);

      // Submit search
      await this.submitSearchManually(page);

      // Wait for results
      await this.waitForSearchResults(page);

      return this.parseInterceptedData(options);
    } finally {
      await browser.close();
    }
  }

  /**
   * Manually fill search form with delays to avoid detection
   */
  async fillSearchFormManually(page, params) {
    try {
      console.log("📝 Manually filling search form...");

      // Wait for form to be ready
      await page.waitForSelector('input[placeholder*="From"], #origin', {
        timeout: 10000,
      });

      // Fill origin
      const originSelector =
        'input[placeholder*="From"], #origin, [data-test-id="origin"] input';
      await page.waitForSelector(originSelector, { timeout: 5000 });
      await page.click(originSelector);
      await this.waitFor(page, 500);
      await page.type(originSelector, params.from || "PHL", { delay: 100 });
      await this.waitFor(page, 1000);
      await page.keyboard.press("Tab");

      // Fill destination
      const destSelector =
        'input[placeholder*="To"], #destination, [data-test-id="destination"] input';
      await page.waitForSelector(destSelector, { timeout: 5000 });
      await page.click(destSelector);
      await this.waitFor(page, 500);
      await page.type(destSelector, params.to || "NYC", { delay: 100 });
      await this.waitFor(page, 1000);
      await page.keyboard.press("Tab");

      // Fill departure date
      if (params.departDate) {
        const depDateSelector =
          'input[placeholder*="Depart"], #departDate, [data-test-id="departure-date"] input';
        try {
          await page.waitForSelector(depDateSelector, { timeout: 5000 });
          await page.click(depDateSelector);
          await this.waitFor(page, 500);
          // Clear existing value
          await page.keyboard.down("Control");
          await page.keyboard.press("KeyA");
          await page.keyboard.up("Control");
          await page.type(depDateSelector, params.departDate, { delay: 100 });
          await this.waitFor(page, 1000);
        } catch (e) {
          console.log("⚠️ Could not fill departure date:", e.message);
        }
      }

      // Fill return date if provided
      if (params.returnDate) {
        const retDateSelector =
          'input[placeholder*="Return"], #returnDate, [data-test-id="return-date"] input';
        try {
          await page.waitForSelector(retDateSelector, { timeout: 5000 });
          await page.click(retDateSelector);
          await this.waitFor(page, 500);
          await page.keyboard.down("Control");
          await page.keyboard.press("KeyA");
          await page.keyboard.up("Control");
          await page.type(retDateSelector, params.returnDate, { delay: 100 });
          await this.waitFor(page, 1000);
        } catch (e) {
          console.log("⚠️ Could not fill return date:", e.message);
        }
      }

      console.log("✅ Search form filled manually");
    } catch (error) {
      console.log("❌ Error filling search form manually:", error.message);
      throw error;
    }
  }

  /**
   * Manually submit search form
   */
  async submitSearchManually(page) {
    try {
      console.log("🚀 Submitting search manually...");

      // Look for search button with multiple selectors
      const searchSelectors = [
        'button[type="submit"]',
        '[data-test-id="search-button"]',
        'button:contains("Search")',
        ".search-button",
        "button.btn-primary",
        '[aria-label*="Search"]',
      ];

      let searchSubmitted = false;

      for (const selector of searchSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            console.log(`✅ Search submitted using selector: ${selector}`);
            searchSubmitted = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!searchSubmitted) {
        // Try pressing Enter as fallback
        await page.keyboard.press("Enter");
        console.log("✅ Search submitted via Enter key");
      }

      // Wait for navigation/response
      await this.waitFor(page, 3000);
    } catch (error) {
      console.log("❌ Error submitting search manually:", error.message);
      throw error;
    }
  }

  /**
   * Provide troubleshooting information when search fails
   */
  getTroubleshootingInfo() {
    const summary = this.getSummary();

    const troubleshooting = {
      summary,
      possibleIssues: [],
      recommendations: [],
    };

    // Analyze failed requests
    if (summary.failedRequestCount > 0) {
      const http2Errors = summary.failedRequests.filter((req) =>
        req.error.includes("ERR_HTTP2_PROTOCOL_ERROR")
      ).length;

      if (http2Errors > 0) {
        troubleshooting.possibleIssues.push(
          "HTTP/2 Protocol Errors detected - likely anti-bot protection"
        );
        troubleshooting.recommendations.push(
          "Try using the form interaction method instead of URL navigation"
        );
        troubleshooting.recommendations.push(
          "Consider adding longer delays between requests"
        );
        troubleshooting.recommendations.push(
          "Try using a residential proxy or VPN"
        );
      }
    }

    if (summary.totalResponses === 0) {
      troubleshooting.possibleIssues.push("No API responses intercepted");
      troubleshooting.recommendations.push(
        "Check if United website structure has changed"
      );
      troubleshooting.recommendations.push("Verify the search URL is correct");
      troubleshooting.recommendations.push(
        "Try running with headless: false to see what's happening"
      );
    }

    return troubleshooting;
  }

  /**
   * Clear intercepted data (useful for multiple searches)
   */
  clearData() {
    this.interceptedData = [];
  }
}

// Usage example and test function with enhanced error handling
async function testWithURL(searchURL, options = {}) {
  console.log("🚀 Testing United Flight Searcher with URL...\n");

  const searcher = new UnitedFlightSearcher({
    headless: false,
    saveResponses: true,
    outputDir: "./flight_data",
  });

  try {
    // First try the URL-based approach
    console.log("📋 Method 1: URL Navigation");
    console.log("=".repeat(40));

    const results = await searcher.searchByURL(searchURL, {
      logRequests: true,
      filename: options.filename,
    });

    console.log("\n📋 Flight Search Results:");
    console.log("=".repeat(50));
    displayResults(results);

    return results;
  } catch (error) {
    console.error("❌ URL Navigation Error:", error.message);

    // Get troubleshooting information
    const troubleshooting = searcher.getTroubleshootingInfo();
    console.log("\n🔍 Troubleshooting Information:");
    console.log("=".repeat(50));
    console.log("Possible Issues:", troubleshooting.possibleIssues);
    console.log("Recommendations:", troubleshooting.recommendations);

    // Try alternative form interaction method
    try {
      console.log("\n📋 Method 2: Form Interaction (Fallback)");
      console.log("=".repeat(40));

      // Extract search parameters from URL
      const searchParams = extractParamsFromURL(searchURL);
      const formResults = await searcher.searchByFormInteraction(searchParams, {
        logRequests: true,
        filename: options.filename,
      });

      console.log("\n📋 Form Interaction Results:");
      console.log("=".repeat(50));
      displayResults(formResults);

      return formResults;
    } catch (formError) {
      console.error("❌ Form Interaction Error:", formError.message);

      // Final troubleshooting
      const finalTroubleshooting = searcher.getTroubleshootingInfo();
      console.log("\n🆘 Final Troubleshooting Information:");
      console.log("=".repeat(50));
      console.log(
        "Summary:",
        JSON.stringify(finalTroubleshooting.summary, null, 2)
      );

      throw new Error(
        "Both URL navigation and form interaction methods failed. Check troubleshooting information above."
      );
    }
  }
}

function extractParamsFromURL(url) {
  try {
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    return {
      from: params.get("f"),
      to: params.get("t"),
      departDate: params.get("d"),
      returnDate: params.get("r"),
      passengers: parseInt(params.get("px")) || 1,
    };
  } catch (error) {
    console.log("⚠️ Could not parse URL parameters, using defaults");
    return {
      from: "PHL",
      to: "NYC",
      departDate: "2025-08-15",
      returnDate: "2025-08-17",
      passengers: 1,
    };
  }
}

function displayResults(results) {
  if (results.flights && results.flights.length > 0) {
    results.flights.forEach((flight, index) => {
      console.log(`\nTrip ${flight.tripIndex || index + 1}:`);
      console.log(
        `  Route: ${flight.originDecoded || flight.origin} → ${
          flight.destinationDecoded || flight.destination
        }`
      );
      console.log(
        `  Date: ${flight.departDate}${
          flight.departTime ? ` at ${flight.departTime}` : ""
        }`
      );

      if (flight.fares && flight.fares.length > 0) {
        console.log("  Available Fares:");
        flight.fares.forEach((fare) => {
          const refundable = fare.isRefundable ? " (Refundable)" : "";
          console.log(
            `    - ${fare.cabinClass} (${fare.type})${refundable}: ${fare.description}`
          );
        });
      }

      if (flight.pricing && flight.pricing.length > 0) {
        console.log("  Pricing by Airport:");
        flight.pricing.forEach((price) => {
          console.log(
            `    - ${price.airport}: ${price.price} ${price.currency} (${price.fareFamily})`
          );
        });
      }

      if (flight.searchFilters && flight.searchFilters.priceRange) {
        console.log(
          `  Price Range: ${flight.searchFilters.priceRange.min} - ${flight.searchFilters.priceRange.max}`
        );
      }
    });

    if (results.searchInfo) {
      console.log(
        `\n📊 Search Status: ${
          results.searchInfo.status === 1 ? "Success" : "Warning/Error"
        }`
      );
      if (
        results.searchInfo.warnings &&
        results.searchInfo.warnings.length > 0
      ) {
        console.log(
          "⚠️ Warnings:",
          results.searchInfo.warnings.map((w) => w.Message).join(", ")
        );
      }
      if (results.searchInfo.errors && results.searchInfo.errors.length > 0) {
        console.log(
          "❌ Errors:",
          results.searchInfo.errors.map((e) => e.Message || e).join(", ")
        );
      }
    }

    if (results.metadata) {
      console.log(`\n📊 Metadata:`);
      console.log(
        `  Intercepted Responses: ${results.metadata.interceptedResponses}`
      );
      console.log(
        `  Response Timestamp: ${results.metadata.responseTimestamp}`
      );
      console.log(`  API URL: ${results.metadata.apiUrl}`);
    }
  } else {
    console.log("No flights found or error occurred:", results.error);

    if (results.rawData) {
      console.log("Raw data available for debugging. Check saved JSON files.");
    }
  }
}

// Export for use as module
module.exports = {
  UnitedFlightSearcher,
  testWithURL,
  extractParamsFromURL,
  displayResults
};

// Run test if called directly
if (require.main === module) {
  // Example URL (you would generate this with the URL builder)
  const exampleURL =
    "https://www.united.com/en/us/fsr/choose-flights?f=PHL&t=NEW%20YORK%2C%20NY%2C%20US%20(ALL%20AIRPORTS)&d=2025-08-15&r=2025-08-17&sc=7%2C7&ct=1&px=1&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=R";

  testWithURL(exampleURL, {
    filename: "test_flight_search.json",
  });
}
