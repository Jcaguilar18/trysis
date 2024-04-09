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
cron.schedule('44 13 * * *', async () => {
  try {
    // Copy data from items to report
    await db.query('INSERT INTO report SELECT *, CURRENT_DATE AS item_date FROM item');
    console.log('Data copied from items to report successfully at 11:59 PM.');
  } catch (error) {
    console.error('Error copying data:', error);
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
app.post("/generate-report", async (req, res) => {
  const { startDate, endDate, reportType } = req.body;
  try {
    const reportQueryResult = await db.query("SELECT * FROM report WHERE item_date BETWEEN $1 AND $2", [startDate, endDate]);
    const reportData = reportQueryResult.rows;

    let logDescription = `Report generated for period ${startDate} to ${endDate} as ${reportType.toUpperCase()}`;

    if (reportType === 'pdf') {
      try {
        const pdfPath = await generatePDF(reportData);
        res.download(pdfPath, async err => {
          if (err) {
            throw err; // Handle error, but ensure the file is deleted if it was created.
          }
          fs.unlinkSync(pdfPath); // Delete the file after sending it
        });
        // Log success
        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generated', CURRENT_DATE, $3)",
          [req.user.username, logDescription, req.user.picture_url]
        );
      } catch (pdfErr) {
        console.error('Error generating PDF:', pdfErr);
        res.status(500).send('Error generating PDF');
        logDescription = `Failed to generate PDF report for period ${startDate} to ${endDate}`;
        // Log failure
        await db.query(
          "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generation Failed', CURRENT_DATE, $3)",
          [req.user.username, logDescription, req.user.picture_url]
        );
      }
    } else if (reportType === 'csv') {
      const csvString = generateCSV(reportData);
      const csvPath = join(__dirname, `report-${Date.now()}.csv`);
      fs.writeFileSync(csvPath, csvString);
      res.download(csvPath, async err => {
        if (err) {
          throw err; // Handle error, but ensure the file is deleted if it was created.
        }
        fs.unlinkSync(csvPath); // Delete the file after sending it
      });
      // Log success
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generated', CURRENT_DATE, $3)",
        [req.user.username, logDescription, req.user.picture_url]
      );
    }
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).send('Internal Server Error');
    logDescription = `Failed to generate report for period ${startDate} to ${endDate}`;
    // Log failure
    await db.query(
      "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Report Generation Failed', CURRENT_DATE, $3)",
      [req.user.username, logDescription, req.user.picture_url]
    );
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

app.post("/update-account", async (req, res) => {
  const { userId, username, password, status } = req.body;
  let logDescription = `Account updated: `; // Initialize log description

  try {
    let updateFields = {
      username: username,
      status: status
    };

    if (password && password.trim() !== '') {
      const pepperedPassword = password + (process.env.PEPPER || '');
      const hashedPassword = await bcrypt.hash(pepperedPassword, saltRounds);
      updateFields.password = hashedPassword;
      logDescription += `password changed, `;
    }

    const setClause = Object.keys(updateFields).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    const sqlQuery = `UPDATE users SET ${setClause} WHERE userid = $${Object.keys(updateFields).length + 1}`;
    const queryParams = [...Object.values(updateFields), userId];

    await db.query(sqlQuery, queryParams);

    // Add more details to log description based on fields updated
    if (updateFields.username) logDescription += `username to ${username}, `;
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

app.get("/logs", async (req, res) => {
  const currentPage = req.query.page ? parseInt(req.query.page, 10) : 1;
  const transTypeFilter = req.query.trans_type || null;
  const logsPerPage = 10;
  const offset = (currentPage - 1) * logsPerPage;
  let logsResult, countResult, totalLogs, query;

  try {
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;
    if (transTypeFilter) {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs WHERE trans_type = $1 ORDER BY log_id DESC LIMIT $2 OFFSET $3",
        values: [transTypeFilter, logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs WHERE trans_type = $1", [transTypeFilter]);
    } else {
      query = {
        text: "SELECT log_id, username, description, material_name, log_date, quantity, trans_type, picture FROM logs ORDER BY log_id DESC LIMIT $1 OFFSET $2",
        values: [logsPerPage, offset],
      };
      countResult = await db.query("SELECT COUNT(*) FROM logs");
    }

    totalLogs = parseInt(countResult.rows[0].count, 10);
    logsResult = await db.query(query);
    const logs = logsResult.rows;
    const totalPages = Math.ceil(totalLogs / logsPerPage);

    res.render("logs.ejs", {
      roleOf,
      logs,
      currentPage,
      totalPages,
      logsPerPage,
      transTypeFilter // Pass the current filter back to the template
    });
  } catch (err) {
    console.error("Error fetching logs:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/item", async (req, res) => {

  var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
  var roleOf = roleOfQueryResult.rows[0]?.role;

  var itemOfQueryResult = await db.query("SELECT * FROM item");
  var clusterquery = await db.query("SELECT * FROM cluster");
  var clusterquery1 = await db.query("SELECT * FROM cluster WHERE classification_id = 1");
  var clusterquery2 = await db.query("SELECT * FROM cluster WHERE classification_id = 2");
  var clusterquery3 = await db.query("SELECT * FROM cluster WHERE classification_id = 3");
  const cluster = clusterquery.rows;
  const cluster1 = clusterquery1.rows;
  const cluster2 = clusterquery2.rows;
  const cluster3 = clusterquery3.rows;
  const item= itemOfQueryResult.rows;
      //console.log(item);
      //console.log(cluster);
      //console.log(roleOf);
  res.render("item.ejs", {item, roleOf, cluster, cluster1, cluster2, cluster3});
});

app.get("/manage", async (req, res) => {
  try {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
      // Fetch user data from the database
      const usersResult = await db.query("SELECT * FROM users");
      const users = usersResult.rows;
      
      var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
      var roleOf = roleOfQueryResult.rows[0]?.role;
      console.log("Start: testing in /manage");
      console.log(roleOf);
      console.log(req.session.username);////////////////////////////////////////////// important code take note!
      console.log("end of testing: /manage")
   

      // Render the "manage.ejs" template with the user data
      res.render("manage.ejs", { users, roleOf });
  } catch (err) {
      console.log(err);
      res.redirect("/login");
  }
});



// Route to render the form for adding an item
app.get("/add-item", (req, res) => {
  const clcode = req.query.clustercode;
  res.render("add-item.ejs", {clcode});
});

// Route to render the form for adding an item
app.get("/stock", async (req, res) => {
  try {
    
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;
    
    var clusterquery = await db.query("SELECT * FROM cluster");
    const cluster = clusterquery.rows;

    var itemOfQueryResult = await db.query(`
      SELECT item.*, cluster.description as cluster_description 
      FROM item 
      INNER JOIN cluster ON item.clustercode = cluster.clustercode`);
    var items = itemOfQueryResult.rows;

    // Fetch the total_available from the logs for each item
    for (let item of items) {
      const fetchTotalAvailableQuery = `SELECT total_available FROM logs WHERE item_description = $1 ORDER BY log_id DESC LIMIT 1`;
      const fetchTotalAvailableResult = await db.query(fetchTotalAvailableQuery, [item.material_name]);
      item.available = fetchTotalAvailableResult.rows[0] ? fetchTotalAvailableResult.rows[0].total_available : 0;
    }

    console.log("testStock uname");
    console.log(req.session.username);
    console.log("end /stock");
     
    res.render("stock.ejs", {items, roleOf, cluster});
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});

/*
app.get("/logs/:page?", async (req, res) => {
  try {
    var roleOfQueryResult = await db.query("SELECT role FROM users WHERE username = $1", [req.session.username]);
    var roleOf = roleOfQueryResult.rows[0]?.role;

    var page = req.params.page || 1;
    var offset = (page - 1) * 5;

    var countQuery = await db.query("SELECT COUNT(*) FROM inventory");
    var totalRecords = countQuery.rows[0].count;
    var totalPages = Math.ceil(totalRecords / 5);
    
    var logsquery = await db.query("SELECT * FROM inventory ORDER BY changeid LIMIT 5 OFFSET $1", [offset]);
    const logs = logsquery.rows;

    console.log("testStock uname");
    console.log(req.session.username);
    console.log("end /logs");
     
    res.render("logs.ejs", {logs, roleOf, page, totalPages});
  } catch (error) {
    console.error(`Error: ${error}`);
    res.status(500).send('An error occurred');
  }
});
*/


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
  res.render("add-cluster.ejs");
});

app.get("/update-cluster", (req, res) => {
  res.render("update-cluster.ejs");
});

// Route to handle form submission for adding an item
app.post("/add-item", async (req, res) => {
  const { materialName, clcode, price, available } = req.body;

  try {
    // Get the classification_id based on the provided clustercode
    const classificationQueryResult = await db.query("SELECT classification_id FROM cluster WHERE clustercode = $1", [clcode]);
    if (classificationQueryResult.rows.length === 0) {
      return res.status(400).send("Invalid cluster code.");
    }
    const classificationId = classificationQueryResult.rows[0].classification_id;

    // Insert the new item
    await db.query(
      "INSERT INTO item (classification_id, material_name, clustercode, price, available) VALUES ($1, $2, $3, $4, $5)",
      [classificationId, materialName, clcode, price, available]
    );

    if (req.isAuthenticated()) {
      const userPictureUrl = req.user.picture_url;
      const logDescription = `${req.user.username} added a new item: ${materialName}`;
      console.log(userPictureUrl);
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture) VALUES ($1, $2, 'Added', CURRENT_DATE, $3)",
        [req.user.username, logDescription, userPictureUrl]
      );
    }
    

    // Redirect back to the item page
    res.redirect("/item");
  } catch (error) {
    console.error("Error adding item:", error);
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
  try {
      // Extract data from the request body
      const { clustercode, description, classificationid } = req.body;

      // Update the cluster in the database
      await db.query(
          "UPDATE cluster SET description = $1, classification_id = $2 WHERE clustercode = $3",
          [description, classificationid, clustercode]
      );

      // If the user is authenticated, log the action
      if (req.isAuthenticated()) {
          const currentUser = req.user; // The current logged-in user
          const logDescription = `${currentUser.username} updated cluster: ${clustercode}`;

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
        ORDER BY log_date DESC, log_id DESC
        LIMIT 3  -- Adjust the number as per your needs
      `);
      const productUpdates = productUpdatesResult.rows;

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

app.get("/generate-report-page", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.isAuthenticated()) {
    
    try {
      const roleOf = await db.query("SELECT role FROM users WHERE username = $1", [req.user.username]);
      req.session.username = req.user.username;
      req.session.roleOf = roleOf;
      res.render("generate-report-page.ejs", { roleOf: roleOf.rows[0].role });
      
    } catch (err) {
      console.log(err);
      res.redirect("/login");
    }
  } else {
    res.redirect("/login");
  }
});

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login-failed' }),
  function(req, res) {
    res.redirect('/dashboard');
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

    // Fetch the total of 'Incoming' and 'Outgoing' from the logs table for this item
    const fetchIncomingTotalQuery = `SELECT SUM(quantity) as total FROM logs WHERE item_description = $1 AND daily_trans_type = 'Incoming'`;
    const fetchIncomingTotalResult = await db.query(fetchIncomingTotalQuery, [itemDescription]);
    const incomingTotal = fetchIncomingTotalResult.rows[0] ? fetchIncomingTotalResult.rows[0].total : 0;

    const fetchOutgoingTotalQuery = `SELECT SUM(quantity) as total FROM logs WHERE item_description = $1 AND daily_trans_type = 'Outgoing'`;
    const fetchOutgoingTotalResult = await db.query(fetchOutgoingTotalQuery, [itemDescription]);
    const outgoingTotal = fetchOutgoingTotalResult.rows[0] ? fetchOutgoingTotalResult.rows[0].total : 0;

    // Calculate new total_available value
    var totalAvailable = incomingTotal - (-outgoingTotal);

    // Determine the daily transaction type
    var dailyTransType = '';
    if (parsedIncoming !== 0) {
      dailyTransType = 'Incoming';
      totalAvailable += parsedIncoming;
    } else if (parsedOutgoing !== 0) {
      dailyTransType = 'Outgoing';
      totalAvailable -= parsedOutgoing;
    }

    // If the user is authenticated, log the action
    if (req.isAuthenticated()) {
      const currentUser = req.user;
      const logDescription = `${currentUser.username} updated stock for item: ${itemDescription}`;

      // Insert the log entry into the logs table
      await db.query(
        "INSERT INTO logs (username, description, trans_type, log_date, picture, quantity, daily_trans_type, item_description, total_available) VALUES ($1, $2, $3, CURRENT_DATE, $4, $5, $6, $7, $8)",
        [currentUser.username, logDescription, 'Modified', currentUser.picture_url, parsedIncoming - parsedOutgoing, dailyTransType, itemDescription, totalAvailable]
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
      res.redirect("/dashboard");
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
          return done(null, false, { message: 'Incorrect username or password.' });
        }
      } else {
        // No user found with that username
        return done(null, false, { message: 'Incorrect username or password.' });
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