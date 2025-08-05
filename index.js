// Function to format order side for display
function formatOrderSide(orderSide) {
  switch(orderSide) {
    case 'ORDER_SIDE_BUY':
      return 'Buy';
    case 'ORDER_SIDE_SELL':
      return 'Sell';
    default:
      return orderSide;
  }
}

// Function to create CSV content from orders
function createCSVContent(allOrdersByPortfolio) {
  // CSV Headers - Added "Size Asset" and "Total Asset" columns
  const headers = ['Date', 'Side', 'Pair', 'Size', 'Size Asset', 'Price', 'Total', 'Total Asset', 'Order ID', 'Portfolio'];
  let csvContent = headers.join(',') + '\n';
  
  let skippedOrders = 0;
  let includedOrders = 0;
  
  // Process all orders from all portfolios
  for (const [portfolioId, portfolioData] of Object.entries(allOrdersByPortfolio)) {
    for (const order of portfolioData.orders) {
      // Format date - use placedAt as primary date field
      const date = order.placedAt || order.orderDate || '';
      
      // Format side
      const side = formatOrderSide(order.orderSide);
      const isSell = order.orderSide === 'ORDER_SIDE_SELL';
      const isBuy = order.orderSide === 'ORDER_SIDE_BUY';
      
      // Format pair - TARGET/CONTRA (not CONTRA/TARGET)
      const contraTicker = order.contraAsset?.ticker || 'Unknown';
      const targetTicker = order.targetAsset?.ticker || 'Unknown';
      const pair = `${targetTicker}/${contraTicker}`;
      
      // Get size - handle the nested structure
      let size = '0';
      if (order.filled && order.filled.targetAssetAmount) {
        // For filled orders, use the actual filled amount
        size = order.filled.targetAssetAmount;
      } else if (order.size) {
        // Size can be an object or a string
        if (typeof order.size === 'object' && order.size.filled) {
          size = order.size.filled;
        } else if (typeof order.size === 'object' && order.size.amount) {
          size = order.size.amount;
        } else if (typeof order.size === 'string' || typeof order.size === 'number') {
          size = order.size;
        }
      } else if (order.filledSize) {
        size = order.filledSize;
      }
      
      // Get price - use averagePrice from filled data or calculate it
      let price = '0';
      if (order.filled && order.filled.averagePrice) {
        price = order.filled.averagePrice;
      } else if (order.rate) {
        price = order.rate;
      } else if (order.filled && order.filled.contraAssetAmount && order.filled.targetAssetAmount) {
        // Calculate price if we have both amounts
        const contraAmount = parseFloat(order.filled.contraAssetAmount);
        const targetAmount = parseFloat(order.filled.targetAssetAmount);
        if (targetAmount > 0) {
          price = (contraAmount / targetAmount).toString();
        }
      }
      
      // Get total - use contraAssetAmount for total value
      let total = '0';
      if (order.filled && order.filled.contraAssetAmount) {
        total = order.filled.contraAssetAmount;
      } else if (order.contraNotional) {
        total = order.contraNotional;
      } else if (order.contraAmount) {
        total = order.contraAmount;
      }
      
      // Skip orders with no meaningful data
      const sizeNum = parseFloat(size);
      const priceNum = parseFloat(price);
      const totalNum = parseFloat(total);
      
      // Skip if size is 0 or NaN, OR if price is 0/NaN/invalid, OR if total is 0
      if (isNaN(sizeNum) || sizeNum === 0 || 
          isNaN(priceNum) || priceNum === 0 || price === 'NaN' ||
          isNaN(totalNum) || totalNum === 0) {
        skippedOrders++;
        continue;
      }
      
      // Apply negative signs based on order side
      // Sell orders: negative size
      // Buy orders: negative total
      if (isSell) {
        size = '-' + Math.abs(sizeNum).toString();
      }
      if (isBuy) {
        total = '-' + Math.abs(totalNum).toString();
      }
      
      const orderId = order.orderId || '';
      
      // Create CSV row - properly escape values that might contain commas
      const row = [
        date,
        side,
        pair,
        size,
        targetTicker,  // Size Asset
        price,
        total,
        contraTicker,  // Total Asset
        orderId,
        portfolioData.portfolioName
      ].map(value => {
        // Convert to string and escape if necessary
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      
      csvContent += row.join(',') + '\n';
      includedOrders++;
    }
  }
  
  console.log(`   ℹ️  Included ${includedOrders} orders with valid data`);
  if (skippedOrders > 0) {
    console.log(`   ⚠️  Skipped ${skippedOrders} orders with incomplete data (0 size/price/total)`);
  }
  
  return csvContent;
}

// Function to save CSV file
function saveCSVFile(csvContent, organizationId) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `definitive_orders_${organizationId}_${timestamp}.csv`;
  const filepath = path.join(process.cwd(), filename);
  
  try {
    fs.writeFileSync(filepath, csvContent, 'utf8');
    console.log(`\n💾 CSV file saved successfully!`);
    console.log(`📄 Filename: ${filename}`);
    console.log(`📍 Location: ${filepath}`);
    return { success: true, filename, filepath };
  } catch (error) {
    console.error(`\n❌ Error saving CSV file:`, error.message);
    return { success: false, error: error.message };
  }
}const crypto = require('crypto');
const https = require('https');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// API Credentials will be provided by user input
let API_KEY = '';
let API_SECRET = '';

// Organization ID will be provided by user input
let ORGANIZATION_ID = '';

// Helper function to prepare the prehash for signing
function preparePrehash({ method, timestamp, path, queryParams, headers, body }) {
  // Only include these specific headers in the prehash
  const headersForPrehash = {
    'x-definitive-api-key': headers['x-definitive-api-key'],
    'x-definitive-timestamp': headers['x-definitive-timestamp'],
  };

  // Sort headers alphabetically
  const sortedHeaders = Object.entries(headersForPrehash)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join(',');

  // Stringify query params
  const queryParamsString = new URLSearchParams(queryParams).toString();
  const bodyString = body || '';

  return `${method}:${path}?${queryParamsString}:${timestamp}:${sortedHeaders}${bodyString}`;
}

// Helper function to sign the request
function signRequest(method, path, queryParams = {}, body = null, includeOrgHeader = false) {
  const timestamp = Date.now().toString();
  
  // Prepare headers for signing (without org ID)
  const headersForSigning = {
    'x-definitive-api-key': API_KEY,
    'x-definitive-timestamp': timestamp,
  };

  // Generate the message to be signed
  const message = preparePrehash({
    method,
    path,
    timestamp,
    headers: headersForSigning,
    queryParams,
    body,
  });

  // Remove the dpks_ prefix and sign
  const secret = API_SECRET.replace('dpks_', '');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  // Prepare final headers for request
  const requestHeaders = {
    'x-definitive-api-key': API_KEY,
    'x-definitive-timestamp': timestamp,
    'x-definitive-signature': signature,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  // Add organization header if needed (but not for /v2/organization endpoint)
  if (includeOrgHeader) {
    requestHeaders['x-definitive-organization-id'] = ORGANIZATION_ID;
  }

  return {
    headers: requestHeaders,
    timestamp,
  };
}

// Function to make API request
function makeRequest(method, path, queryParams = {}, body = null, includeOrgHeader = false) {
  return new Promise((resolve, reject) => {
    const { headers } = signRequest(method, path, queryParams, body, includeOrgHeader);
    
    const queryString = new URLSearchParams(queryParams).toString();
    const fullPath = queryString ? `${path}?${queryString}` : path;

    const options = {
      hostname: 'ddp.definitive.fi',
      port: 443,
      path: fullPath,
      method: method,
      headers: headers,
    };

    // Only show detailed request info if debugging
    if (process.env.DEBUG === 'true') {
      console.log(`Making request to: https://${options.hostname}${fullPath}`);
    }

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (process.env.DEBUG === 'true') {
          console.log(`Response status: ${res.statusCode}`);
        }
        
        try {
          const jsonData = JSON.parse(data);
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            console.error('API Error:', res.statusCode, jsonData);
            reject(new Error(`API Error: ${res.statusCode} - ${JSON.stringify(jsonData)}`));
          }
        } catch (e) {
          console.error('Failed to parse response as JSON');
          console.error('Raw response was:', data);
          reject(new Error(`Failed to parse JSON response. Status: ${res.statusCode}, Response: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      console.error('Request error:', e);
      reject(e);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// Function to fetch all portfolios with pagination
async function fetchAllPortfolios() {
  console.log('🔍 Fetching portfolios for organization...\n');
  
  const portfolios = [];
  let hasMore = true;
  let nextCursor = null;
  let pageCount = 0;

  try {
    while (hasMore) {
      pageCount++;
      console.log(`📄 Fetching portfolio page ${pageCount}...`);
      
      const queryParams = {
        limit: '100',
      };
      
      if (nextCursor) {
        queryParams.cursor = nextCursor;
      }

      // For /v2/organization endpoint, organizationId goes in query params, not headers
      queryParams.organizationId = ORGANIZATION_ID;

      const response = await makeRequest('GET', '/v2/organization', queryParams, null, false);
      
      if (response.data && Array.isArray(response.data)) {
        portfolios.push(...response.data);
        console.log(`✅ Retrieved ${response.data.length} portfolios`);
        
        // Only show raw response if SHOW_RAW env var is set
        if (process.env.SHOW_RAW === 'true') {
          console.log(`\n--- Portfolio Page ${pageCount} Response ---`);
          console.log(JSON.stringify(response, null, 2));
          console.log('--- End of Page ---\n');
        }
      }

      // Check pagination
      if (response.pagination) {
        hasMore = response.pagination.hasMore || false;
        nextCursor = response.pagination.nextCursor || null;
      } else {
        hasMore = false;
      }
    }

    console.log(`\n✨ Total portfolios found: ${portfolios.length}\n`);
    return portfolios;

  } catch (error) {
    console.error('❌ Error fetching portfolios:', error.message);
    throw error;
  }
}

// Function to fetch all orders for a specific portfolio
async function fetchOrdersForPortfolio(portfolioId, portfolioName) {
  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`📁 Portfolio: ${portfolioName}`);
  console.log(`   ID: ${portfolioId}`);
  console.log(`${'='.repeat(60)}`);
  
  const orders = [];
  let hasNextPage = true;
  let nextCursor = null;
  let pageCount = 0;
  const startTime = Date.now();

  try {
    while (hasNextPage) {
      pageCount++;
      const pageFetchStart = Date.now();
      
      console.log(`\n📄 Fetching page ${pageCount}...`);
      
      const queryParams = {
        limit: '100',
      };
      
      if (nextCursor) {
        queryParams.cursor = nextCursor;
      }

      const path = `/v2/organization/portfolios/${portfolioId}/orders`;
      const response = await makeRequest('GET', path, queryParams, null, true);
      
      const pageFetchTime = ((Date.now() - pageFetchStart) / 1000).toFixed(2);
      
      if (response.orders && Array.isArray(response.orders)) {
        orders.push(...response.orders);
        const ordersOnPage = response.orders.length;
        
        console.log(`✅ Retrieved ${ordersOnPage} orders in ${pageFetchTime}s`);
        console.log(`📊 Progress: ${orders.length} total orders fetched`);
        
        // Show a simple progress indicator
        const progressBar = '█'.repeat(Math.min(pageCount, 20)) + '░'.repeat(Math.max(0, 20 - pageCount));
        console.log(`   [${progressBar}] Page ${pageCount}${hasNextPage ? '+' : ' (final)'}`);
        
        // Only show raw response if there are orders
        if (ordersOnPage > 0 && process.env.SHOW_RAW === 'true') {
          console.log(`\n--- Raw Response Page ${pageCount} ---`);
          console.log(JSON.stringify(response, null, 2));
          console.log('--- End of Raw Response ---\n');
        }
      }

      // Check pagination
      hasNextPage = response.hasNextPage || false;
      nextCursor = response.nextCursor || null;
      
      // Show estimated remaining pages based on current pattern
      if (hasNextPage && orders.length > 0) {
        const avgOrdersPerPage = orders.length / pageCount;
        console.log(`   ℹ️  More pages available`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✨ Completed fetching orders for ${portfolioName}`);
    console.log(`   Total: ${orders.length} orders across ${pageCount} pages in ${totalTime}s`);
    
    return orders;

  } catch (error) {
    console.error(`\n❌ Error fetching orders for portfolio ${portfolioName}:`, error.message);
    return [];
  }
}

// Function to get user input
function getUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Main function to fetch all portfolios and their orders
async function fetchAllOrganizationOrders() {
  // Prompt for API credentials and organization ID
  console.log('🚀 Welcome to Definitive API Order Fetcher\n');
  console.log('🔑 Generate a read only API key with organization access at https://app.definitive.fi/account/organization\n');
  console.log('📝 Note: Set environment variables for additional output:');
  console.log('   SHOW_RAW=true  - Show raw JSON responses');
  console.log('   DEBUG=true     - Show detailed request/response info\n');
  
  // Get API credentials
  API_KEY = await getUserInput('Please enter your API Key (starts with dpka_): ');
  if (!API_KEY || !API_KEY.startsWith('dpka_')) {
    console.error('\n❌ ERROR: Invalid API Key! It should start with "dpka_"');
    return;
  }
  
  API_SECRET = await getUserInput('Please enter your API Secret (starts with dpks_): ');
  if (!API_SECRET || !API_SECRET.startsWith('dpks_')) {
    console.error('\n❌ ERROR: Invalid API Secret! It should start with "dpks_"');
    return;
  }
  
  ORGANIZATION_ID = await getUserInput('Please enter your Organization ID: ');
  if (!ORGANIZATION_ID) {
    console.error('\n❌ ERROR: Organization ID cannot be empty!');
    return;
  }

  console.log(`\n🔐 Credentials received`);
  console.log(`🏢 Using Organization ID: ${ORGANIZATION_ID}\n`);
  const overallStartTime = Date.now();

  try {
    // Step 1: Fetch all portfolios
    const portfolios = await fetchAllPortfolios();
    
    if (portfolios.length === 0) {
      console.log('⚠️  No portfolios found for this organization.');
      return;
    }

    // Step 2: Fetch orders for each portfolio
    console.log(`\n📊 Starting to fetch orders for ${portfolios.length} portfolio(s)...\n`);
    
    const allOrdersByPortfolio = {};
    let totalOrders = 0;
    let portfolioIndex = 0;

    for (const portfolio of portfolios) {
      portfolioIndex++;
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🔄 Processing portfolio ${portfolioIndex}/${portfolios.length}`);
      
      const orders = await fetchOrdersForPortfolio(portfolio.portfolioId, portfolio.portfolioName);
      allOrdersByPortfolio[portfolio.portfolioId] = {
        portfolioName: portfolio.portfolioName,
        orders: orders,
        orderCount: orders.length,
      };
      totalOrders += orders.length;
    }

    const totalTime = ((Date.now() - overallStartTime) / 1000).toFixed(2);

    // Summary
    console.log('\n\n' + '═'.repeat(60));
    console.log('📈 FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`🏢 Organization ID: ${ORGANIZATION_ID}`);
    console.log(`📁 Total portfolios: ${portfolios.length}`);
    console.log(`📋 Total orders across all portfolios: ${totalOrders}`);
    console.log(`⏱️  Total execution time: ${totalTime}s`);
    console.log('\n📊 Orders per portfolio:');
    
    for (const [portfolioId, data] of Object.entries(allOrdersByPortfolio)) {
      const orderText = data.orderCount === 1 ? 'order' : 'orders';
      console.log(`   • ${data.portfolioName}: ${data.orderCount} ${orderText}`);
    }
    
    // Export to CSV
    if (totalOrders > 0) {
      console.log('\n' + '─'.repeat(60));
      console.log('📊 Exporting orders to CSV...');
      
      const csvContent = createCSVContent(allOrdersByPortfolio);
      const csvResult = saveCSVFile(csvContent, ORGANIZATION_ID);
      
      if (csvResult.success) {
        // Count included orders (actual data rows, not including skipped)
        const allRows = csvContent.split('\n').filter(row => row.trim() !== '');
        const dataRows = allRows.length - 1; // -1 for header
        console.log(`✅ Exported ${dataRows} valid orders to CSV`);
      }
    }
    
    console.log('\n✅ Process completed successfully!');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
  }
}

// Run the script
fetchAllOrganizationOrders();
