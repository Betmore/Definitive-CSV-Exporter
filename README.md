# Definitive API Order Exporter

This Node.js script connects to the Definitive API to fetch all historical trade orders across all portfolios within a specified organization. It then processes, cleans, and exports this data into a single, well-structured CSV file.

## Security Note

**For your account's security, it is strongly recommended that you only use an API key with read-only permissions. This script does not require trading or withdrawal permissions to function.**

## Summary

The script automates the process of data extraction by handling API authentication, pagination, and data formatting. It first retrieves a list of all portfolios associated with your organization ID. Then, for each portfolio, it iteratively fetches all order history pages until the entire trade history is collected. Finally, it consolidates all orders, formats them into a clean tabular structure, and saves the result as a CSV file on your local machine.

## Key Features

-   **Full Data Retrieval**: Automatically handles API pagination to fetch *all* portfolios and *all* orders, no matter how numerous.
-   **Data Quality Assurance**: Automatically skips orders with incomplete or zero-value data (e.g., size, price, or total is 0) to ensure the output is clean and usable.
-   **Timestamped CSV Export**: Saves the final data to a uniquely named CSV file (e.g., `definitive_orders_your-org-id_2025-08-05T11-30-00.csv`).
-   **Zero Dependencies**: Runs with a standard Node.js installation, requiring no external packages.
-   **Debugging Options**: Includes flags (`DEBUG`, `SHOW_RAW`) for advanced troubleshooting.

## Prerequisites

-   [Node.js](https://nodejs.org/) (v14.x or later is recommended).
-   Your Definitive API Key, API Secret, and Organization ID.

## Installation

1.  Clone the repository or download the script file (e.g., `index.js`) to your local machine.
2.  No further installation steps like `npm install` are needed, as the script only uses built-in Node.js modules.

## How to Run

1.  Open your terminal or command prompt.
2.  Navigate to the directory where you saved the script.
3.  Execute the script using the following command:
    ```bash
    node index.js
    ```
4.  The script will prompt you to enter your credentials:
    ```
    Please enter your API Key (starts with dpka_): your_api_key_here
    Please enter your API Secret (starts with dpks_): your_api_secret_here
    Please enter your Organization ID: your_organization_id_here
    ```
5.  The script will then begin fetching the data, displaying its progress along the way. Upon completion, it will save the CSV file in the same directory and print the filename and location to the console.

### Advanced Usage (Debugging)

You can set environment variables before the command to get more detailed output:

-   **For detailed request/response logs:**
    ```bash
    DEBUG=true node export_orders.js
    ```
-   **To see the raw JSON data received from the API:**
    ```bash
    SHOW_RAW=true node export_orders.js
    ```

## Example Output (CSV Content)

The script generates a CSV file with the following columns.

| Date | Side | Pair | Size | Size Asset | Price | Total | Total Asset | Order ID | Portfolio |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 2024-11-20T10:05:30Z | Buy | cbBTC/USDC | 0.5 | cbBTC | 65000.50 | -32500.25 | USDC | a1b2c3d4-e5f6 | Main Trading |
| 2024-11-19T15:30:10Z | Sell | ETH/cbBTC | -10.0 | ETH | 0.0521 | 0.521 | cbBTC | f6e5d4c3-b2a1 | DeFi Alpha |
| 2024-11-18T09:00:00Z | Buy | SOL/USDC | 150.25 | SOL | 145.10 | -21801.275 | USDC | 1234abcd-5678 | NFT Fund |
| 2024-11-18T08:45:12Z | Sell | cbBTC/USD | -0.1 | cbBTC | 65250.00 | 6525.00 | USDC | 9876fedc-5432 | Main Trading |
