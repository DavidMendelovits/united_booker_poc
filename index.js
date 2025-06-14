const { UnitedFlightSearcher } = require('./united');

async function main() {
    const searcher = new UnitedFlightSearcher({ headless: false });
    
    // You'll need to use searchByURL method with a proper United URL
    // Use the urlBuilder to create the URL first
    const { UnitedURLBuilder } = require('./urlBuilder');
    const urlBuilder = new UnitedURLBuilder();
    
    const searchURL = urlBuilder.buildOneWayURL('PHL', 'LGA', '08/15/2025', {
        passengers: 1
    });
    
    console.log('Search URL:', searchURL);
    
    const results = await searcher.searchByURL(searchURL);
    console.log(results);
}

main().catch(console.error);