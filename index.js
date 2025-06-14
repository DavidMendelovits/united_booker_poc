const UnitedFlightSearcher = require('./united-flight-searcher');

const searcher = new UnitedFlightSearcher({ headless: false });
const results = await searcher.searchFlights({
    from: 'PHL',
    to: 'NYC', 
    departDate: '08/15/2025',
    passengers: 1
});
console.log(results);