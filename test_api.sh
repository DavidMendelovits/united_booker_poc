#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API base URL - change this if your server runs on a different port/host
API_URL="http://localhost:3000"

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

# Function to make API calls and handle responses
make_api_call() {
    local endpoint=$1
    local method=$2
    local data=$3
    local description=$4

    echo -e "\n${GREEN}Testing: $description${NC}"
    echo "Endpoint: $endpoint"
    echo "Method: $method"
    echo "Data: $data"

    # Make the API call
    response=$(curl -s -X "$method" \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$API_URL$endpoint")

    # Check if the response is valid JSON
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Valid JSON response${NC}"
        echo "Response:"
        echo "$response" | jq .
    else
        echo -e "${RED}✗ Invalid JSON response${NC}"
        echo "Raw response:"
        echo "$response"
    fi
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed. Please install it to run this script.${NC}"
    echo "On macOS: brew install jq"
    echo "On Ubuntu/Debian: sudo apt-get install jq"
    exit 1
fi

# Check if the server is running
if ! curl -s "$API_URL" > /dev/null; then
    echo -e "${RED}Error: Server is not running at $API_URL${NC}"
    echo "Please start the server first using: node server.js"
    exit 1
fi

print_header "Testing API Endpoints"

# Test 1: Build a round-trip URL
make_api_call "/api/roundtrip" "POST" '{
    "from": "PHL",
    "to": "NYC",
    "departDate": "2025-08-15",
    "returnDate": "2025-08-17",
    "passengers": 1,
    "cabinClass": "economy"
}' "Building Round-Trip URL"

# Store the URL from the response
search_url=$(echo "$response" | jq -r '.url')

if [ -z "$search_url" ] || [ "$search_url" = "null" ]; then
    echo -e "${RED}Error: Failed to get search URL${NC}"
    exit 1
fi

print_header "Testing Flight Search"

# Test 2: Search flights using the generated URL
make_api_call "/api/search" "POST" "{
    \"url\": \"$search_url\"
}" "Searching Flights"

# Check if the search was successful
if echo "$response" | jq -e '.results.flights' > /dev/null; then
    echo -e "${GREEN}✓ Flight search successful${NC}"
    
    # Display summary of results
    echo -e "\n${BLUE}Search Summary:${NC}"
    echo "$response" | jq '.summary'
    
    # Display number of flights found
    flight_count=$(echo "$response" | jq '.results.flights | length')
    echo -e "\n${GREEN}Found $flight_count flights${NC}"
else
    echo -e "${RED}✗ Flight search failed${NC}"
    echo "Error details:"
    echo "$response" | jq '.error'
    echo "$response" | jq '.troubleshooting'
fi

print_header "Test Complete"

# Optional: Save the results to a file
timestamp=$(date +%Y%m%d_%H%M%S)
echo "$response" | jq . > "search_results_$timestamp.json"
echo -e "${GREEN}Results saved to search_results_$timestamp.json${NC}" 