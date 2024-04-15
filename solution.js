import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import cron from 'node-cron';
// Schedule the task to run at 11:59 PM every day
cron.schedule('58 10 * * *', async () => {
  try {
    // Begin transaction
    await db.query('BEGIN');

    // Insert the backup into the report table with the current timestamp, including the status from the cluster table
    const backupQuery = `
      INSERT INTO report (classification_id, material_name, clustercode, price, description, item_id, total_incoming, total_outgoing, beginning_inventory, item_date, available, status) 
      SELECT i.classification_id, i.material_name, i.clustercode, i.price, i.description, i.item_id, i.total_incoming, i.total_outgoing, i.available, NOW(), i.available, c.status
      FROM item i
      JOIN cluster c ON i.clustercode = c.clustercode
    `;
    await db.query(backupQuery);
    console.log('Data backed up successfully.');

    // Update the beginning_inventory to the most recent backup's available for each item
    const updateBeginningInventoryQuery = `
      UPDATE item i
      SET beginning_inventory = (
        SELECT r.available
        FROM report r
        WHERE r.material_name = i.material_name AND r.clustercode = i.clustercode
        ORDER BY r.item_date DESC
        LIMIT 1
      )
    `;
    await db.query(updateBeginningInventoryQuery);

    // Reset incoming and outgoing totals
    await db.query('UPDATE item SET total_incoming = 0, total_outgoing = 0');
    console.log('Incoming and outgoing totals reset to zero.');

    // Commit transaction
    await db.query('COMMIT');
  } catch (error) {
    // Rollback transaction in case of error
    await db.query('ROLLBACK');
    console.error('Error during backup process:', error);
  }
});


const app = express();
const port = 3000;
const saltRounds = 10;

//test
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});


db.connect();

app.get("/", (req, res) => {
  res.render("login.ejs");
});

app.get("/login", (req, res) => {
  res.render("login.ejs");
});

// Assuming all necessary imports are at the top of your solution.js file


import { fileURLToPath } from "url";
import { dirname, join } from "path";
import PDFDocument from "pdfkit";
import { Parser } from "json2csv";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// ... (other imports and configurations)

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ... (rest of your express and db setup)

// Helper function to generate CSV
const generateCSV = (data) => {
  const parser = new Parser();
  return parser.parse(data);
};

const generatePDF = (data) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const filePath = `report-${Date.now()}.pdf`;
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    
    // Set up the table header
    const tableTop = 100;
    const itemColumns = {
      classification_id: { columnWidth: 100, columnStart: 50 },
      material_name: { columnWidth: 150, columnStart: 150 },
      clustercode: { columnWidth: 100, columnStart: 300 },
      // Add other columns as necessary
    };

    // Draw the table header
    doc.fontSize(12);
    for (let key in itemColumns) {
      const title = key.replace(/_/g, ' ').toUpperCase();
      const { columnStart } = itemColumns[key];
      doc.text(title, columnStart, tableTop);
    }

    // Draw the table rows
    doc.fontSize(10);
    let i = 0;
    data.forEach(item => {
      const y = tableTop + 20 + (i * 20);
      for (let key in itemColumns) {
        const { columnStart } = itemColumns[key];
        doc.text(item[key], columnStart, y);
      }
      i++;
    });

    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
};

// Route handler for report generation
app.post("/generate-report-page", async (req, res) => {
  const { startDate } = req.body;
  const { endDate } = req.body;
  const currentUser = req.session.username;
const currentRole =req.session.roleOf;
const reportType ='notyet';
let logDescription = `Report generated for period ${startDate} to ${endDate} as ${reportType.toUpperCase()}`;
const marker = new Date(req.body.endDate).toISOString().split('T')[0];
//console.log(currentRole);
console.log(currentUser);
//console.log(marker);
  try {
    const reportQueryResult = await db.query(`
SELECT classification_id, clustercode, description, available, price, item_date, status
FROM report
WHERE item_date::DATE = $1 AND status = 'SET'
`, [endDate]);
    console.log(reportQueryResult);

    if (reportQueryResult.rows.length === 0) {
      return res.status(404).send('No report found for the selected date.');
    }

    let aggregatedData = {};
    reportQueryResult.rows.forEach(item => {
      const key = item.clustercode;
      if (!aggregatedData[key]) {
        aggregatedData[key] = {
          classification_id: item.classification_id,
          clustercode: item.clustercode,
          descriptions: new Set(),
          total_amount: 0
        };
      }
      aggregatedData[key].descriptions.add(item.description);
      aggregatedData[key].total_amount += (item.available * item.price);
    });

    const reportData = Object.values(aggregatedData).map(item => ({
      ...item,
      description: Array.from(item.descriptions).join(", ")
    }));

    // Calculate subtotals for each classification
    let subtotals = reportData.reduce((acc, item) => {
      const classification = item.classification_id.toString();
      acc[classification] = (acc[classification] || 0) + item.total_amount;
      return acc;
    }, {});

    
    

    // Calculate the grand total
    let grandTotal = Object.values(subtotals).reduce((total, current) => total + current, 0);
    //console.log(reportData[0].item_date);
    //console.log(reportQueryResult.rows);
    //console.log(reportData);
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generated', CURRENT_DATE, $3)",
      [req.user.username, logDescription, req.user.picture_url]
    );
    res.render("report-page.ejs", {
      reportData,
      subtotals,
      grandTotal,
      currentUser: req.session.username,
  currentRole: req.session.roleOf,
      marker
    });
  } catch (err) {
    console.error('Error generating report page:', err);
    res.status(500).send('Internal Server Error');
    logDescription = `Failed to generate PDF report for period ${startDate} to ${endDate}`;
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generation Failed', CURRENT_DATE, $3)",
      [req.user.username, logDescription, req.user.picture_url]
    );
  }
});

app.post('/generate-bincard', async (req, res) => {
  const { clusterCode } = req.body; // Capture the clusterCode from the form submission

  try {
    // Modify your query to select only items with the provided clusterCode
    const bincardDataQuery = await db.query(`
      SELECT clustercode, material_name, description, beginning_inventory, total_incoming, total_outgoing, available, price
      FROM item
      WHERE clustercode = $1
      ORDER BY material_name
    `, [clusterCode]); // Use the clusterCode in the query

    let bincards = {};

    bincardDataQuery.rows.forEach(item => {
      // Since we're filtering by clustercode, we know there's only one bincard
      if (!bincards[clusterCode]) {
        bincards[clusterCode] = { items: [] };
      }

      bincards[clusterCode].items.push({
        name: item.material_name,
        description: item.description,
        beginningInventory: item.beginning_inventory,
        totalIncoming: item.total_incoming,
        totalOutgoing: item.total_outgoing,
        available: item.available,
        unitPrice: item.price,
        totalValue: item.available * item.price
      });
    });

    // Check if we actually have a bincard with that clusterCode
    if (!bincards[clusterCode] || bincards[clusterCode].items.length === 0) {
      return res.status(404).send('No bin card found for the provided cluster code.');
    }

    res.render('bincard.ejs', {
      bincards: bincards, // This now only contains the bincard(s) for the provided clusterCode
      currentUser: req.session.username,
      currentRole: req.session.roleOf,
    });
  } catch (err) {
    console.error('Error generating bin card:', err);
    res.status(500).send('Internal Server Error');
  }
});


import path from 'path';
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}
///////////////////////////////
import multer from 'multer';

const storage = multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, 'uploads/');
    },
    filename: function (req, file, callback) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        callback(null, file.fieldname + '-' + uniqueSuffix);
    }
});

const upload = multer({ storage: storage });
app.use('/uploads', express.static('uploads'));
// ... (rest of your express app logic)


app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.post('/generate-report', async (req, res) => {
  const { startDate, endDate, clusterCode, reportType } = req.body;

  if (reportType === 'final') {
    const currentUser = req.session.username;
    const currentRole =req.session.roleOf;
    const reportType ='notyet';
    let logDescription = `Report generated for period ${startDate} to ${endDate} as ${reportType.toUpperCase()}`;
    const marker = new Date(req.body.endDate).toISOString().split('T')[0];
    //console.log(currentRole);
    console.log(currentUser);
    //console.log(marker);
      try {
        const reportQueryResult = await db.query(`
    SELECT classification_id, clustercode, description, available, price, item_date, status
    FROM report
    WHERE item_date::DATE = $1 AND status = 'SET'
    `, [endDate]);
        console.log(reportQueryResult);
    
        if (reportQueryResult.rows.length === 0) {
          return res.status(404).send('No report found for the selected date.');
        }
    
        let aggregatedData = {};
        reportQueryResult.rows.forEach(item => {
          const key = item.clustercode;
          if (!aggregatedData[key]) {
            aggregatedData[key] = {
              classification_id: item.classification_id,
              clustercode: item.clustercode,
              descriptions: new Set(),
              total_amount: 0
            };
          }
          aggregatedData[key].descriptions.add(item.description);
          aggregatedData[key].total_amount += (item.available * item.price);
        });
    
        const reportData = Object.values(aggregatedData).map(item => ({
          ...item,
          description: Array.from(item.descriptions).join(", ")
        }));
    
        // Calculate subtotals for each classification
        let subtotals = reportData.reduce((acc, item) => {
          const classification = item.classification_id.toString();
          acc[classification] = (acc[classification] || 0) + item.total_amount;
          return acc;
        }, {});
    
        
        
    
        // Calculate the grand total
        let grandTotal = Object.values(subtotals).reduce((total, current) => total + current, 0);
        //console.log(reportData[0].item_date);
        //console.log(reportQueryResult.rows);
        //console.log(reportData);
        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generated', CURRENT_DATE, $3)",
          [req.user.username, logDescription, req.user.picture_url]
        );
        res.render("report-page.ejs", {
          reportData,
          subtotals,
          grandTotal,
          currentUser: req.session.username,
      currentRole: req.session.roleOf,
          marker
        });
      } catch (err) {
        console.error('Error generating report page:', err);
        res.status(500).send('Internal Server Error');
        logDescription = `Failed to generate PDF report for period ${startDate} to ${endDate}`;
        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generation Failed', CURRENT_DATE, $3)",
          [req.user.username, logDescription, req.user.picture_url]
        );
      }
  } else if (reportType === 'bincard') {
    try {
      // Modify your query to select only items with the provided clusterCode
      const bincardDataQuery = await db.query(`
        SELECT clustercode, material_name, description, beginning_inventory, total_incoming, total_outgoing, available, price
        FROM item
        WHERE clustercode = $1
        ORDER BY material_name
      `, [clusterCode]); // Use the clusterCode in the query
  
      let bincards = {};
  
      bincardDataQuery.rows.forEach(item => {
        // Since we're filtering by clustercode, we know there's only one bincard
        if (!bincards[clusterCode]) {
          bincards[clusterCode] = { items: [] };
        }
  
        bincards[clusterCode].items.push({
          name: item.material_name,
          description: item.description,
          beginningInventory: item.beginning_inventory,
          totalIncoming: item.total_incoming,
          totalOutgoing: item.total_outgoing,
          available: item.available,
          unitPrice: item.price,
          totalValue: item.available * item.price
        });
      });
  
      // Check if we actually have a bincard with that clusterCode
      if (!bincards[clusterCode] || bincards[clusterCode].items.length === 0) {
        return res.status(404).send('No bin card found for the provided cluster code.');
      }
  
      res.render('bincard.ejs', {
        bincards: bincards, // This now only contains the bincard(s) for the provided clusterCode
        currentUser: req.session.username,
        currentRole: req.session.roleOf,
      });
    } catch (err) {
      console.error('Error generating bin card:', err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(400).send('Invalid report type.');
  }
});


app.get("/logs", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const currentPage = req.query.page ? parseInt(req.query.page, 10) : 1;
  const transTypeFilter = req.query.trans_type || null;
  const logsPerPage = 10;
  const offset = (currentPage - 1) * logsPerPage;
  let logsResult, countResult, totalLogs, query;

  try {

    const userResult = await db.query("SELECT picture_url, role FROM users WHERE username = $1", [req.user.username]);
    const user = userResult.rows[0];
    const pictureUrl = user?.picture_url;
    const roleOfUser = user?.role;

    var roleOfQueryResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;

    if (transTypeFilter) {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, oldvaluesummary, newvaluesummary, picture FROM logs WHERE trans_type = $1 ORDER BY log_id DESC LIMIT $2 OFFSET $3",
        values: [transTypeFilter, logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs WHERE trans_type = $1", [transTypeFilter]);
    } else {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, oldvaluesummary, newvaluesummary, picture FROM logs ORDER BY log_id DESC LIMIT $1 OFFSET $2",
        values: [logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs");
    }

    totalLogs = parseInt(countResult.rows[0].count, 10);
    logsResult = await db.query(query);
    const logs = logsResult.rows;
    const totalPages = Math.ceil(totalLogs / logsPerPage);

    // Calculate the start and end page for pagination
    const startPage = Math.floor((currentPage - 1) / 5) * 5 + 1;
    const endPage = Math.min(startPage + 4, totalPages);

    res.render("logs.ejs", {
      roleOf,
      pictureUrl: './uploads/' + pictureUrl,
      roleOfUser,
      logs,
      currentPage,
      startPage,
      endPage,
      totalPages,
      logsPerPage,
      transTypeFilter // Pass the current filter back to the template
    });
  } catch (err) {
    // res.redirect("/login");
    console.error("Error fetching logs:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/item", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {

    const userResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.user.username]);
    const user = userResult.rows[0];
    const roleOf = user?.role;
    const pictureUrl = user?.picture_url;

    var itemOfQueryResult = await db.query(`
    SELECT 
    i.classification_id,
    i.material_name AS item_description,
    i.clustercode,
    COALESCE(l2.logs_available, 0) AS beginning_inventory,
    COALESCE(SUM(l.incoming), 0) AS total_incoming,
    COALESCE(SUM(l.outgoing), 0) AS total_outgoing,
    i.available,
    i.price,
    i.description,
    ROUND((i.available * i.price)::numeric, 2) AS value_of_raw_material_on_hand
  FROM item i
  LEFT JOIN logs l ON i.clustercode = l.logs_clustercode AND i.material_name = l.logs_material_name
  LEFT JOIN (
    SELECT 
      logs_material_name, 
      logs_clustercode, 
      logs_available 
    FROM logs 
    WHERE log_date < CURRENT_DATE
    ORDER BY log_date DESC, log_id DESC 
    LIMIT 1
  ) l2 ON i.material_name = l2.logs_material_name AND i.clustercode = l2.logs_clustercode
  LEFT JOIN cluster c ON i.clustercode = c.clustercode
  WHERE c.status <> 'DESET'
  GROUP BY i.classification_id, i.material_name, i.clustercode, l2.logs_available, i.available, i.price, i.description
  ORDER BY MAX(l.log_id) DESC
   `);
    var clusterquery = await db.query("SELECT * FROM cluster WHERE status != 'DESET'");
    var clusterquery1 = await db.query("SELECT * FROM cluster WHERE classification_id = 1 AND status != 'DESET'");
    var clusterquery2 = await db.query("SELECT * FROM cluster WHERE classification_id = 2 AND status != 'DESET'");
    var clusterquery3 = await db.query("SELECT * FROM cluster WHERE classification_id = 3 AND status != 'DESET'");
    var allClusterQuery = await db.query("SELECT * FROM cluster");
    const cluster = clusterquery.rows;
    const cluster1 = clusterquery1.rows;
    const cluster2 = clusterquery2.rows;
    const cluster3 = clusterquery3.rows;
    const cluster4 = allClusterQuery.rows;
    const item= itemOfQueryResult.rows;

  res.render("item.ejs", {item, roleOf, cluster, cluster1, cluster2, cluster3, pictureUrl: './uploads/' + pictureUrl, cluster4});

  } catch (err) {
    console.error(err);
    // res.redirect("/login");
    res.status(500).send("Internal Server Error");
  }
});

app.get("/manage", async (req, res) => {
  try {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const userResultToPage = await db.query("SELECT picture_url, role FROM users WHERE username = $1", [req.user.username]);
  const user = userResultToPage.rows[0];
  const pictureUrl = user?.picture_url;
  const roleOf = user?.role;
  
      // Fetch user data from the database
      const usersResult = await db.query("SELECT * FROM users");
      const users = usersResult.rows;
    
     // console.log("Start: testing in /manage");
      //console.log(roleOf);
      //console.log(req.session.username);////////////////////////////////////////////// important code take note!
      //console.log("end of testing: /manage")
   

      // Render the "manage.ejs" template with the user data
      res.render("manage.ejs", { users, roleOf, pictureUrl: './uploads/' + pictureUrl});
  } catch (err) {
      console.log(err);
      res.redirect("/login");
  }
});

app.post("/update-account", async (req, res) => {
  const { userId, username, firstname, lastname, password, role, status } = req.body;
  let logDescription = 'Account updated: '; // Initialize log description

  try {
    let updateFields = {
      username: username,
      role: role,
      status: status,
      firstname: JSON.parse(firstname),
      lastname: JSON.parse(lastname)
    };

    if (password && password.trim() !== '') {
      const pepperedPassword = password + (process.env.PEPPER || '');
      const hashedPassword = await bcrypt.hash(pepperedPassword, saltRounds);
      updateFields.password = hashedPassword;
      logDescription += 'password changed, ';
    }

    const setClause = Object.keys(updateFields)
      .filter(key => updateFields[key] !== undefined && updateFields[key] !== '') // Make sure we don't update with empty strings
      .map((key, idx) => `${key} = $${idx + 1}`)
      .join(', ');

    const queryParams = Object.values(updateFields)
      .filter(value => value !== undefined && value !== '') // Filter out empty strings
      .concat(userId);

    const sqlQuery = `UPDATE users SET ${setClause} WHERE userid = $${queryParams.length}`;

    await db.query(sqlQuery, queryParams);

    // Add more details to log description based on fields updated
    if (updateFields.username) logDescription += `username to ${username}, `;
    if (updateFields.firstname) logDescription += `firstname to ${firstname}, `;
    if (updateFields.lastname) logDescription += `lastname to ${lastname}, `;
    if (updateFields.status) logDescription += `status to ${status}, `;
    logDescription = logDescription.slice(0, -2); // Remove the last comma and space

    // Assuming you have a way to get the current user's username and picture_url
    // Insert log entry
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Account Updated', CURRENT_DATE, $3)",
      [req.user.username, logDescription, req.user.picture_url]
    );

    res.redirect("/manage");
  } catch (err) {
    console.error("Error updating account:", err);
    res.status(500).send("Internal Server Error");
  }
});



// Route to render the form for adding an item
app.get("/add-item", (req, res) => {
  const clcode = req.query.clustercode;
  res.render("add-item.ejs", {clcode});
});

app.get("/update-item", (req, res) => {
  res.render("update-item.ejs");
});


app.get("/stock", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
  const userResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.user.username]);
  const user = userResult.rows[0];
  const roleOf = user?.role;
  const pictureUrl = user?.picture_url;
    
  var clusterquery = await db.query("SELECT * FROM cluster WHERE status != 'DESET'");
  const cluster = clusterquery.rows;

    var itemOfQueryResult = await db.query(`
      SELECT item.*, cluster.description as cluster_description 
      FROM item 
      INNER JOIN cluster ON item.clustercode = cluster.clustercode`);
    const items = itemOfQueryResult.rows;
      //console.log("testStock uname");
    //console.log(req.session.username);
    //console.log("end /stock");
     
    res.render("stock.ejs", {items, roleOf: roleOf, cluster, pictureUrl: './uploads/' + pictureUrl});
  } catch (error) {
    // res.redirect("/login");
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});

app.get("/bin", async (req, res) => {
  var clustercode = req.query.clustercode;
  var itemOfQueryResult = await db.query(`
    SELECT item.*, cluster.description as cluster_description 
    FROM item 
    INNER JOIN cluster ON item.clustercode = cluster.clustercode 
    WHERE item.clustercode = $1`, [clustercode]);

  const items= itemOfQueryResult.rows;
  res.render("bin.ejs", {items});
});


app.get("/add-cluster", (req, res) => {
  const classificationId = req.query.classification_id || 'default-value'; // Use a fallback if necessary
  res.render("add-cluster.ejs", { classificationId: classificationId });
});



app.get("/update-cluster", (req, res) => {
  res.render("update-cluster.ejs");
});

// Route to handle form submission for adding an item
app.post("/add-item", async (req, res) => {
  const { materialName, clcode, price} = req.body;

  try {
    // Get the classification_id based on the provided clustercode
    const classificationQueryResult = await db.query("SELECT classification_id, description FROM cluster WHERE clustercode = $1", [clcode]);
    if (classificationQueryResult.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invalid Cluster Code</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f8f9fa;
                    font-family: Arial, sans-serif;
                }
                .container {
                    text-align: center;
                }
                button {
                    margin-top: 20px;
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>The cluster code ${clcode} is invalid.</h1>
                <button onclick="location.href='/item'">Go Back</button>
            </div>
        </body>
        </html>
      `);
    }
    const classificationId = classificationQueryResult.rows[0].classification_id;
    const clusterDescription = classificationQueryResult.rows[0].description;
    // Insert the new item
    await db.query(
      "INSERT INTO item (classification_id, material_name, clustercode, price, description, beginning_inventory, total_incoming, total_outgoing, available) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [classificationId, materialName, clcode, price, clusterDescription, '0', '0', '0','0']
    );
  
    if (req.isAuthenticated()) {
      const userPictureUrl = req.user.picture_url;
      const logDescription = `${req.user.username} added a new item: ${materialName}`;
      //console.log(userPictureUrl);
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture, dailyProdUpdate, logs_clustercode, logs_material_name) VALUES ($1, $2, 'Added', CURRENT_DATE, $3, 'Yes', $4, $5)",
        [req.user.username, logDescription, userPictureUrl, clcode, materialName]
      );
    }

    // Redirect back to the item page
    res.redirect("/item");
  } catch (error) {
    console.error("Error adding item:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update-item", async (req, res) => {
  const { materialName, price} = req.body;

  try {
    const materialQueryResult = await db.query("SELECT material_name FROM item WHERE material_name = $1", [materialName]);
    if (materialQueryResult.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Invalid Cluster Code</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background-color: #f8f9fa;
                    font-family: Arial, sans-serif;
                }
                .container {
                    text-align: center;
                }
                button {
                    margin-top: 20px;
                    padding: 10px 20px;
                    font-size: 16px;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1> ${materialName} is invalid or do not exist.</h1>
                <button onclick="location.href='/item'">Go Back</button>
            </div>
        </body>
        </html>
      `);
    }

  await db.query(
    "UPDATE item SET price = $1 WHERE material_name = $2",
    [price, materialName]
  );
  
  if (req.isAuthenticated()) {
    const userPictureUrl = req.user.picture_url;
    const logDescription = `${req.user.username} updated the price of ${materialName}`;
    //console.log(userPictureUrl);
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture, logs_material_name) VALUES ($1, $2, 'Modified', CURRENT_DATE, $3, $4)",
      [req.user.username, logDescription, userPictureUrl, materialName]
    );
  }

    // Redirect back to the item page
    res.redirect("/item");
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/delete-item", async (req, res) => {
  const { materialName } = req.body;

  try {
    const materialQueryResult = await db.query("SELECT material_name FROM item WHERE material_name = $1", [materialName]);
    if (materialQueryResult.rows.length === 0) {
      return res.status(400).send(`
        <!DOCTYPE html>
        ...
        <h1> ${materialName} is invalid or do not exist.</h1>
        ...
      `);
    }

    // Delete the item
    await db.query(
      "DELETE FROM item WHERE material_name = $1",
      [materialName]
    );
  
    if (req.isAuthenticated()) {
      const userPictureUrl = req.user.picture_url;
      const logDescription = `${req.user.username} deleted the item: ${materialName}`;
      //console.log(userPictureUrl);
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture, logs_material_name) VALUES ($1, $2, 'Deleted', CURRENT_DATE, $3, $4)",
        [req.user.username, logDescription, userPictureUrl, materialName]
      );
    }

    // Redirect back to the item page
    res.redirect("/item");
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).send("Internal Server Error");
  }
});



app.post("/add-cluster", async (req, res) => {
  try {
      // Extract data from the request body
      const { clustercode, description, classificationid } = req.body;

      // Insert the cluster into the database
      await db.query(
          "INSERT INTO cluster (clustercode, description, classification_id) VALUES ($1, $2, $3)",
          [clustercode, description, classificationid]
      );

      // If the user is authenticated, log the action
      if (req.isAuthenticated()) {
          const currentUser = req.user; // The current logged-in user
          const logDescription = `${currentUser.username} added a new cluster: ${clustercode}`;

          // Insert the log entry into the logs table
          await db.query(
              "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Added', CURRENT_DATE, $3)",
              [currentUser.username, logDescription, currentUser.picture_url] // Use the current user's picture_url
          );
      }

      // Redirect back to the original page after adding the item
      res.redirect("/item");
  } catch (error) {
      console.error("Error adding cluster:", error);
      res.status(500).send("Internal Server Error");
  }
});

app.post("/update-cluster", async (req, res) => {
  const { classification_id, code, description, status } = req.body;

  try {
    let updateFields = {
      classification_id: classification_id,
      clustercode: code,
      description: description,
      status: status // Change 'SET' to 'DESET'
    };

    const setClause = Object.keys(updateFields)
      .filter(key => updateFields[key] !== undefined && updateFields[key] !== '') // Make sure we don't update with empty strings
      .map((key, idx) => `${key} = $${idx + 1}`)
      .join(', ');

    const queryParams = Object.values(updateFields)
      .filter(value => value !== undefined && value !== '') // Filter out empty strings
      .concat(code);

    const sqlQuery = `UPDATE cluster SET ${setClause} WHERE clustercode = $${queryParams.length}`;

    await db.query(sqlQuery, queryParams);

    // If the user is authenticated, log the action
    if (req.isAuthenticated()) {
        const currentUser = req.user; // The current logged-in user
        const logDescription = `${currentUser.username} updated cluster: ${code}`;

        // Insert the log entry into the logs table
        await db.query(
            "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Updated', CURRENT_DATE, $3)",
            [currentUser.username, logDescription, currentUser.picture_url] // Use the current user's picture_url
        );
    }

    // Redirect back to the original page after updating the item
    res.redirect("/item");
  } catch (error) {
    console.error("Error updating cluster:", error);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/logout", (req, res) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/login");
  });
});

app.get("/dashboard", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    try {

  // Getting the Picture and Role of the USer
  const userResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.user.username]);
  const user = userResult.rows[0];
  const roleOf = user?.role;
  const pictureUrl = user?.picture_url;

      // Fetch the latest updates for products
      const productUpdatesResult = await db.query(`
      SELECT * FROM logs 
      WHERE dailyprodupdate = 'Yes'
      ORDER BY log_id DESC
      LIMIT 4
    `);
    const productUpdates = productUpdatesResult.rows.map(row => {
      let productUpdate = {};
      productUpdate.materialName = row.logs_clustercode;
      productUpdate.itemName = row.logs_material_name;
      if (row.trans_type === 'Added' && row.incoming === null && row.outgoing === null) {
        productUpdate.productUpdate = 'Stock Added';
        productUpdate.quantity = '';
      } else if (row.trans_type === 'Added' && row.incoming !== null && row.outgoing !== null) {
        productUpdate.productUpdate = 'Stock Increased';
        productUpdate.quantity = row.incoming - row.outgoing;
      } else if (row.trans_type === 'Removed' && row.incoming !== null && row.outgoing !== null) {
        productUpdate.productUpdate = 'Stock Decreased';
        productUpdate.quantity = row.incoming - row.outgoing;
      }
      else if (row.trans_type === 'Modified' && row.incoming !== null && row.outgoing !== null) {
        productUpdate.productUpdate = 'Stock Unchanged';
        productUpdate.quantity = row.incoming - row.outgoing;
      }
      return productUpdate;
    });

      // Calculate inventory subtotals
      const inventorySubtotalsResult = await db.query(`
        SELECT classification.classification_name, SUM(item.price * item.beginning_inventory) AS subtotal
        FROM item 
        INNER JOIN classification ON item.classification_id = classification.classification_id
        GROUP BY classification.classification_name
      `);
      const inventorySubtotals = inventorySubtotalsResult.rows;

      // Render the dashboard with all necessary data
      res.render("dashboard.ejs", {
        pictureUrl: './uploads/' + pictureUrl,  // Prepend the base directory
        productUpdates: productUpdates,
        roleOf: roleOf,
        productUpdates: productUpdates,
        inventorySubtotals: inventorySubtotals,
        // ... pass other necessary data as well
      });

    } catch (err) {
      console.error("Error accessing the dashboard:", err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/binCardPDF", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    try {
      const userResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.user.username]);
      const user = userResult.rows[0];
      const roleOf = user?.role;
      const pictureUrl = user?.picture_url;

      const clustercode = req.query.clustercode; // Get the clustercode from the query parameters
      const productUpdatesResult = await db.query(`
        SELECT i.clustercode, c.description, i.material_name, i.available, i.price
        FROM item i
        INNER JOIN cluster c ON i.clustercode = c.clustercode
        WHERE i.clustercode=$1
      `, [clustercode]); // Use the clustercode in the query
      const productUpdates = productUpdatesResult.rows;
      const clusterDescription = productUpdates[0]?.description;
      const clusterCode = productUpdates[0]?.clustercode;

      res.render("binCardPDF.ejs", {
        pictureUrl: './uploads/' + pictureUrl,
        productUpdates: productUpdates,
        roleOf: roleOf,
        clusterDescription: clusterDescription,
        clusterCode: clusterCode
      });
    } catch (err) {
      console.error("Error accessing the dashboard:", err);
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/generate-report-page", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    
    try {
      const userResult = await db.query("SELECT role, picture_url FROM users WHERE username = $1", [req.user.username]);
      const user = userResult.rows[0];
      const roleOfUser = user?.role;
      const pictureUrl = user?.picture_url;

      const roleOf = await db.query("SELECT role FROM users WHERE username = $1", [req.user.username]);
      req.session.username = req.user.username;
      req.session.roleOf = roleOf.rows[0].role;
      
      res.render("generate-report-page.ejs", { roleOf: roleOf.rows[0].role, roleOfUser: roleOfUser, pictureUrl: './uploads/' + pictureUrl});
      
    } catch (err) {
      console.log(err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.post('/login',
  function(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
      if (err) { return next(err); }
      if (!user) { return res.render('login.ejs', { error: info.message }); }
      req.logIn(user, function(err) {
        if (err) { return next(err); }
        return res.redirect('/dashboard');
      });
    })(req, res, next);
  }
);

app.get('/login-failed', function(req, res) {
  res.render('login.ejs', { error: 'Enter Correct Credentials' });
});

app.post('/addstock', async (req, res) => {
  const { no, clustercode, incoming, outgoing, itemDescription } = req.body;

  try {
    // Check if the item with the given itemDescription exists in the database
    const checkResult = await db.query("SELECT * FROM item WHERE material_name = $1", [itemDescription]);
    

    if (checkResult.rows.length === 0) {
      res.status(400).send('Item not found');
      return;
    }

    // Parse incoming and outgoing as integers
    const parsedIncoming = parseInt(incoming, 10);
    const parsedOutgoing = parseInt(outgoing, 10);

    // Check if parsing is successful
    if (isNaN(parsedIncoming) || isNaN(parsedOutgoing)) { 
      res.status(400).send('Invalid incoming or outgoing value');
      return;
    }

    // Fetch the available value from the item table
    const fetchAvailableQuery = `SELECT available FROM item WHERE material_name = $1`;
    const fetchAvailableResult = await db.query(fetchAvailableQuery, [itemDescription]);
    const available = fetchAvailableResult.rows[0].available;
    

    
    const fetchPriceQuery = `SELECT price FROM item WHERE material_name = $1`;
    const fetchPriceResult = await db.query(fetchPriceQuery, [itemDescription]);
    const current_price = fetchPriceResult.rows[0].price;


    const itemCheckQuery = `SELECT * FROM item WHERE material_name = $1`;
    const itemCheckResult = await db.query(itemCheckQuery, [itemDescription]);
    const currentItem = itemCheckResult.rows[0];
    const newTotalIncoming = currentItem.total_incoming + parsedIncoming;
    const newTotalOutgoing = currentItem.total_outgoing + parsedOutgoing;


    // Calculate new available value
    let newAvailable = available + parsedIncoming - parsedOutgoing;

    if (newAvailable < 0) {
      newAvailable = 0;
    }

    // Determine the transaction type and log description
    let transType;
    let logDescription;
    const currentUser = req.user;
    if (newAvailable > available) {
      transType = 'Added';
      logDescription = `${currentUser.username} added stock for item: ${itemDescription}`;
    } else if (newAvailable === available){
      transType = 'Modified';
      logDescription = `${currentUser.username} added not stock for item: ${itemDescription}`;
    }
    else if (newAvailable < available){
      transType = 'Removed';
      logDescription = `${currentUser.username} decreased stock for item: ${itemDescription}`;
    }

    const oldlogDescription = `${itemDescription} had an availability of ${available}`;
    // Update the item table
    const updateQuery = `
      UPDATE item
      SET available = $1,
          total_outgoing = $2,
          total_incoming = $3
      WHERE material_name = $4
    `;
    await db.query(updateQuery, [newAvailable,  newTotalOutgoing,newTotalIncoming, itemDescription]);

    // If the user is authenticated, log the action
    if (req.isAuthenticated()) {
      // Insert the log entry into the logs table
      await db.query(
        "INSERT INTO logs (username, newvaluesummary, trans_type, log_date, picture, logs_clustercode, logs_material_name, logs_available, outgoing, incoming, logs_price, dailyprodupdate, oldvaluesummary) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8, $9, $10, $11, $12)",
        [currentUser.username, logDescription, transType, currentUser.picture_url, clustercode, itemDescription, newAvailable, newTotalOutgoing, newTotalIncoming, current_price, 'Yes', oldlogDescription]
      );
    }

    res.redirect("/stock");
  } catch (err) {
    console.error('Error updating stock:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post("/register", upload.single('picture'), async (req, res) => {
  const newUsername = req.body.username; // New user's username
  const password = req.body.password;
  const role = req.body.roles;
  const status = req.body.status;
  const picture = req.file ? req.file.filename : null; // New user's picture

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE username = $1", [newUsername]);

    if (checkResult.rows.length > 0) {
      // User already exists, redirect to an appropriate page
      res.redirect("/user-exists"); // Adjust as necessary
    } else {
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      await db.query(
        "INSERT INTO users (username, password, role, status, picture_url) VALUES ($1, $2, $3, $4, $5)",
        [newUsername, hashedPassword, role, status, picture]
      );

      // Log the action using the current session user's picture
      if (req.isAuthenticated()) {
        const currentUser = req.user; // The current logged-in user
        const logDescription = `${currentUser.username} registered a new user: ${newUsername}`;

        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, $3, CURRENT_DATE, $4)",
          [currentUser.username, logDescription, 'Added', currentUser.picture_url] // Use the current user's picture_url
        );
      }

      // Redirect to a page indicating successful registration
      res.redirect("/manage");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal Server Error");
  }
});


passport.use(new Strategy(
  async function(username, password, done) {
    try {
      const userQueryResult = await db.query("SELECT * FROM users WHERE username = $1", [username]);
      if (userQueryResult.rows.length > 0) {
        const user = userQueryResult.rows[0];
        if (user.status === 'inactive') {
          // User is inactive
          return done(null, false, { message: 'User does not exist anymore.' });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (validPassword) {
          // User authenticated successfully, return the user object including the picture_url
          return done(null, {
            userid: user.userid,
            username: user.username,
            picture_url: user.picture_url  // The name of your column in the users table
          });
        } else {
          // Password did not match
          return done(null, false, { message: 'Incorrect password.' });
        }
      } else {
        // No user found with that username
        return done(null, false, { message: 'Incorrect username.' });
      }
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  // Save only the userid in the session to keep the session size small
  done(null, user.userid);
});

passport.deserializeUser(async (userid, done) => {
  try {
    const userQueryResult = await db.query("SELECT userid, username, picture_url FROM users WHERE userid = $1", [userid]);
    if (userQueryResult.rows.length > 0) {
      const user = userQueryResult.rows[0];
      done(null, user);
    } else {
      done(null, false);
    }
  } catch (err) {
    done(err);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});