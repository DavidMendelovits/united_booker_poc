class UnitedURLBuilder {
    constructor() {
        this.baseUrl = 'https://www.united.com/en/us/fsr/choose-flights';
        
        // Cabin class mappings
        this.cabinClasses = {
            'economy': 1,
            'premium-economy': 2,
            'business': 3,
            'first': 7,
            'premium': 7
        };

        // Sort type mappings
        this.sortTypes = {
            'bestmatches': 'bestmatches',
            'price': 'price',
            'duration': 'duration',
            'departure': 'departure',
            'arrival': 'arrival'
        };

        // Trip type mappings
        this.tripTypes = {
            'roundtrip': 'R',
            'oneway': 'O',
            'multicity': 'M'
        };
    }

    /**
     * Build United Airlines flight search URL
     * @param {Object} options - Search options
     * @param {string} options.from - Origin airport code (e.g., 'PHL')
     * @param {string} options.to - Destination airport code or city (e.g., 'NYC' or 'NEW YORK, NY, US (ALL AIRPORTS)')
     * @param {string} options.departDate - Departure date in YYYY-MM-DD format
     * @param {string} [options.returnDate] - Return date in YYYY-MM-DD format (for round trip)
     * @param {number} [options.passengers=1] - Number of passengers
     * @param {string} [options.cabinClass='economy'] - Cabin class preference
     * @param {string} [options.sortBy='bestmatches'] - Sort preference
     * @param {string} [options.tripType] - Trip type (auto-detected if not provided)
     * @param {boolean} [options.useAllAirports=true] - Use all airports for destination
     * @param {Object} [options.advanced] - Advanced search criteria
     * @returns {string} Complete United Airlines search URL
     */
    buildURL(options) {
        if (!options.from || !options.to || !options.departDate) {
            throw new Error('Required parameters: from, to, departDate');
        }

        const params = new URLSearchParams();
        
        // Basic search parameters
        params.set('f', options.from.toUpperCase());
        params.set('t', this.formatDestination(options.to, options.useAllAirports));
        params.set('d', this.formatDate(options.departDate));
        
        // Return date for round trip
        if (options.returnDate) {
            params.set('r', this.formatDate(options.returnDate));
        }
        
        // Determine trip type
        const tripType = options.tripType || (options.returnDate ? 'roundtrip' : 'oneway');
        params.set('tqp', this.tripTypes[tripType] || 'O');
        
        // Passenger count
        params.set('px', options.passengers || 1);
        
        // Cabin class
        const cabinCode = this.cabinClasses[options.cabinClass?.toLowerCase()] || 1;
        params.set('ct', cabinCode);
        params.set('clm', cabinCode);
        
        // Search criteria (seems to be related to cabin class)
        const searchCriteria = `${cabinCode},${cabinCode}`;
        params.set('sc', searchCriteria);
        
        // Sort type
        params.set('st', this.sortTypes[options.sortBy] || 'bestmatches');
        
        // Standard United parameters
        params.set('taxng', '1');
        params.set('newHP', 'True');
        
        // Advanced parameters
        if (options.advanced) {
            this.addAdvancedParams(params, options.advanced);
        }
        
        return `${this.baseUrl}?${params.toString()}`;
    }

    /**
     * Format destination with proper encoding
     */
    formatDestination(destination, useAllAirports = true) {
        // If it's just an airport code, expand it
        if (destination.length === 3 && /^[A-Z]{3}$/.test(destination)) {
            const cityMap = {
                'NYC': 'NEW YORK, NY, US',
                'LAX': 'LOS ANGELES, CA, US',
                'CHI': 'CHICAGO, IL, US',
                'WAS': 'WASHINGTON, DC, US',
                'SFO': 'SAN FRANCISCO, CA, US',
                'BOS': 'BOSTON, MA, US',
                'MIA': 'MIAMI, FL, US',
                'LAS': 'LAS VEGAS, NV, US',
                'SEA': 'SEATTLE, WA, US',
                'DEN': 'DENVER, CO, US'
            };
            
            const cityName = cityMap[destination.toUpperCase()] || destination.toUpperCase();
            return useAllAirports ? `${cityName} (ALL AIRPORTS)` : cityName;
        }
        
        // If already formatted, return as-is
        return destination;
    }

    /**
     * Format date to YYYY-MM-DD
     */
    formatDate(dateInput) {
        if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }
        
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) {
            throw new Error(`Invalid date: ${dateInput}`);
        }
        
        return date.toISOString().split('T')[0];
    }

    /**
     * Add advanced search parameters
     */
    addAdvancedParams(params, advanced) {
        // Flexible dates
        if (advanced.flexibleDates) {
            params.set('fd', '1');
        }
        
        // Nonstop only
        if (advanced.nonstopOnly) {
            params.set('ns', '1');
        }
        
        // Preferred time of day
        if (advanced.timeOfDay) {
            const timeMap = {
                'morning': 'M',
                'afternoon': 'A', 
                'evening': 'E',
                'night': 'N'
            };
            params.set('tod', timeMap[advanced.timeOfDay.toLowerCase()] || 'A');
        }
        
        // Award travel
        if (advanced.awardTravel) {
            params.set('at', '1');
        }
        
        // Refundable fares only
        if (advanced.refundableOnly) {
            params.set('rf', '1');
        }
        
        // Book with miles
        if (advanced.bookWithMiles) {
            params.set('bwm', '1');
        }
        
        // Corporate/government rates
        if (advanced.corporateCode) {
            params.set('cc', advanced.corporateCode);
        }
        
        // Promo code
        if (advanced.promoCode) {
            params.set('pc', advanced.promoCode);
        }
    }

    /**
     * Build URL for one-way trip
     */
    buildOneWayURL(from, to, departDate, options = {}) {
        return this.buildURL({
            from,
            to,
            departDate,
            tripType: 'oneway',
            ...options
        });
    }

    /**
     * Build URL for round-trip
     */
    buildRoundTripURL(from, to, departDate, returnDate, options = {}) {
        return this.buildURL({
            from,
            to,
            departDate,
            returnDate,
            tripType: 'roundtrip',
            ...options
        });
    }

    /**
     * Build URL for multi-city trip
     */
    buildMultiCityURL(segments, options = {}) {
        // Multi-city requires different URL structure
        // This would need to be implemented based on United's multi-city URL format
        throw new Error('Multi-city URL building not yet implemented');
    }

    /**
     * Parse existing United URL to extract search parameters
     */
    parseURL(url) {
        try {
            const urlObj = new URL(url);
            const params = urlObj.searchParams;
            
            const parsed = {
                from: params.get('f'),
                to: params.get('t'),
                departDate: params.get('d'),
                returnDate: params.get('r'),
                passengers: parseInt(params.get('px')) || 1,
                tripType: this.reverseLookup(this.tripTypes, params.get('tqp')),
                sortBy: this.reverseLookup(this.sortTypes, params.get('st')),
                cabinClass: this.reverseLookup(this.cabinClasses, parseInt(params.get('ct')))
            };
            
            return parsed;
        } catch (error) {
            throw new Error(`Invalid URL: ${error.message}`);
        }
    }

    /**
     * Helper method for reverse lookup in mappings
     */
    reverseLookup(mapping, value) {
        return Object.keys(mapping).find(key => mapping[key] === value);
    }
}

// Usage examples and helper functions
function createSearchURL(options) {
    const builder = new UnitedURLBuilder();
    return builder.buildURL(options);
}

function createOneWayURL(from, to, date, options = {}) {
    const builder = new UnitedURLBuilder();
    return builder.buildOneWayURL(from, to, date, options);
}

function createRoundTripURL(from, to, departDate, returnDate, options = {}) {
    const builder = new UnitedURLBuilder();
    return builder.buildRoundTripURL(from, to, departDate, returnDate, options);
}

// Example usage
function examples() {
    const builder = new UnitedURLBuilder();
    
    console.log('='.repeat(60));
    console.log('UNITED AIRLINES URL BUILDER EXAMPLES');
    console.log('='.repeat(60));
    
    // Example 1: Basic round trip
    console.log('\n1. Basic Round Trip:');
    const url1 = builder.buildURL({
        from: 'PHL',
        to: 'NYC',
        departDate: '2025-08-15',
        returnDate: '2025-08-17',
        passengers: 1
    });
    console.log(url1);
    
    // Example 2: One way with specific cabin class
    console.log('\n2. One Way - First Class:');
    const url2 = builder.buildOneWayURL('LAX', 'NYC', '2025-08-20', {
        passengers: 2,
        cabinClass: 'first',
        sortBy: 'price'
    });
    console.log(url2);
    
    // Example 3: Advanced search options
    console.log('\n3. Advanced Search Options:');
    const url3 = builder.buildURL({
        from: 'SFO',
        to: 'BOS',
        departDate: '2025-09-01',
        returnDate: '2025-09-10',
        passengers: 1,
        cabinClass: 'business',
        sortBy: 'duration',
        advanced: {
            nonstopOnly: true,
            refundableOnly: true,
            timeOfDay: 'morning'
        }
    });
    console.log(url3);
    
    // Example 4: Parse existing URL
    console.log('\n4. Parse Existing URL:');
    const existingURL = 'https://www.united.com/en/us/fsr/choose-flights?f=PHL&t=NEW%20YORK%2C%20NY%2C%20US%20(ALL%20AIRPORTS)&d=2025-08-15&r=2025-08-17&sc=7%2C7&ct=1&px=1&taxng=1&newHP=True&clm=7&st=bestmatches&tqp=R';
    const parsed = builder.parseURL(existingURL);
    console.log('Parsed parameters:', JSON.stringify(parsed, null, 2));
    
    // Example 5: All available options
    console.log('\n5. All Available Options:');
    const url5 = builder.buildURL({
        from: 'CHI',
        to: 'MIA', 
        departDate: '2025-12-15',
        returnDate: '2025-12-22',
        passengers: 3,
        cabinClass: 'premium-economy',
        sortBy: 'bestmatches',
        useAllAirports: true,
        advanced: {
            flexibleDates: true,
            awardTravel: false,
            corporateCode: 'ABC123',
        }
    });
    console.log(url5);
}

// Export for use as module
module.exports = {
    UnitedURLBuilder,
    createSearchURL,
    createOneWayURL, 
    createRoundTripURL
};

// Run examples if called directly
if (require.main === module) {
    examples();
}