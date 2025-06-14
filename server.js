const express = require('express');
const cors = require('cors');
const { UnitedURLBuilder } = require('./urlBuilder');
const { UnitedFlightSearcher } = require('./united');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Create instances
const urlBuilder = new UnitedURLBuilder();
const flightSearcher = new UnitedFlightSearcher({
    headless: true,
    saveResponses: false
});

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'United Airlines URL Builder API',
        endpoints: {
            '/api/build': 'POST - Build a custom search URL',
            '/api/oneway': 'POST - Build a one-way search URL',
            '/api/roundtrip': 'POST - Build a round-trip search URL',
            '/api/parse': 'POST - Parse an existing United URL',
            '/api/search': 'POST - Search flights using a United URL'
        }
    });
});

// Build custom search URL
app.post('/api/build', (req, res) => {
    try {
        const url = urlBuilder.buildURL(req.body);
        res.json({ url });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Build one-way search URL
app.post('/api/oneway', (req, res) => {
    try {
        const { from, to, departDate, ...options } = req.body;
        const url = urlBuilder.buildOneWayURL(from, to, departDate, options);
        res.json({ url });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Build round-trip search URL
app.post('/api/roundtrip', (req, res) => {
    try {
        const { from, to, departDate, returnDate, ...options } = req.body;
        const url = urlBuilder.buildRoundTripURL(from, to, departDate, returnDate, options);
        res.json({ url });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Parse existing United URL
app.post('/api/parse', (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            throw new Error('URL is required');
        }
        const parsed = urlBuilder.parseURL(url);
        res.json(parsed);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Search flights using a United URL
app.post('/api/search', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) {
            throw new Error('URL is required');
        }

        console.log('Starting flight search for URL:', url);

        // Clear any previous search data
        flightSearcher.clearData();

        // Perform the search with a timeout
        const searchPromise = flightSearcher.searchByURL(url, {
            logRequests: true
        });

        // Add a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Search timed out after 2 minutes')), 120000);
        });

        // Race between search and timeout
        const results = await Promise.race([searchPromise, timeoutPromise]);

        // Get summary of the search
        const summary = flightSearcher.getSummary();

        console.log('Search completed successfully');

        // Return both the parsed results and summary
        res.json({
            results,
            summary,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Search error:', error);
        
        // Get troubleshooting information if available
        const troubleshooting = flightSearcher.getTroubleshootingInfo();
        
        res.status(500).json({ 
            error: error.message,
            troubleshooting,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!' });
});

// Cleanup on server shutdown
process.on('SIGINT', async () => {
    process.exit(0);
});

// Start server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 