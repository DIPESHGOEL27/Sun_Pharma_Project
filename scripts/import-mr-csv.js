/**
 * Script to import MR data from CSV file
 * Reads Organogram_list.csv and imports to database via API
 *
 * Usage: node import-mr-csv.js [csv-file-path] [api-url]
 *
 * Example:
 *   node import-mr-csv.js ../Organogram_list.csv http://localhost:3001/api
 *   node import-mr-csv.js ../Organogram_list.csv http://34.14.133.242/api
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

// Default paths
const DEFAULT_CSV_PATH = path.join(__dirname, "../../Organogram_list.csv");
const DEFAULT_API_URL = "http://localhost:3001/api";

// Parse command line arguments
const csvPath = process.argv[2] || DEFAULT_CSV_PATH;
const apiUrl = process.argv[3] || DEFAULT_API_URL;

console.log(`\n🚀 MR Import Script`);
console.log(`===================`);
console.log(`📄 CSV File: ${csvPath}`);
console.log(`🌐 API URL: ${apiUrl}`);
console.log();

// Check if file exists
if (!fs.existsSync(csvPath)) {
  console.error(`❌ Error: CSV file not found at ${csvPath}`);
  process.exit(1);
}

// Read and parse CSV
function parseCSV(content) {
  const lines = content.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());

  console.log(`📋 CSV Headers: ${headers.join(", ")}`);

  const records = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Simple CSV parsing (handles basic cases)
    const values = line.split(",").map((v) => v.trim());

    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });

    records.push(record);
  }

  return records;
}

// Map CSV record to MR format
function mapToMR(record) {
  return {
    name: record["NAME"] || "",
    designation: record["DESIGNATION"] || "",
    hq: record["H.Q."] || "",
    emp_code: record["EMP CODE"] || "",
    region: record["REGION"] || "",
    zone: record["ZONE"] || "",
    email: record["Email Id"] || "",
    phone: record["Mobile No"] || "",
  };
}

// Make HTTP request
function makeRequest(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === "https:";
    const lib = isHttps ? https : http;

    const postData = JSON.stringify(data);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = lib.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  try {
    // Read CSV file
    const content = fs.readFileSync(csvPath, "utf-8");
    const records = parseCSV(content);

    console.log(`📊 Found ${records.length} records in CSV\n`);

    // Map to MR format
    const mrs = records.map(mapToMR).filter((mr) => mr.emp_code && mr.name); // Only include valid records

    console.log(`✅ Valid MR records: ${mrs.length}`);

    if (mrs.length === 0) {
      console.log("❌ No valid MR records found");
      process.exit(1);
    }

    // Show sample
    console.log(`\n📝 Sample record:`);
    console.log(JSON.stringify(mrs[0], null, 2));

    // Import via API
    console.log(`\n📤 Sending to API...`);
    const result = await makeRequest(`${apiUrl}/admin/import-mrs`, { mrs });

    console.log(`\n✨ Import Complete!`);
    console.log(`   ➕ New records: ${result.imported}`);
    console.log(`   🔄 Updated records: ${result.updated}`);

    if (result.errors && result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
      result.errors.forEach((err) => {
        console.log(`      - ${err.emp_code}: ${err.error}`);
      });
    }

    console.log(`\n🎉 Done!`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
